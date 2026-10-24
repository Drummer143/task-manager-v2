//! The page routes against a database. They need a disposable Postgres; `#[sqlx::test]` creates a
//! fresh database per test there:
//!   DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres cargo test -p main_service -- --ignored
//! Never point it at a shared database.

use axum::http::StatusCode;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    signals::Sent,
    workspaces::test_app::{self, guest_of, user, workspace_of},
};

async fn send(
    pool: &PgPool,
    user_id: Uuid,
    method: &str,
    workspace_id: Uuid,
    path: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    test_app::send(
        pool,
        user_id,
        method,
        workspace_id,
        &format!("/pages{path}"),
        body,
    )
    .await
}

/// A new page; its id.
async fn create(pool: &PgPool, user_id: Uuid, workspace_id: Uuid, body: Value) -> Uuid {
    let (status, page) = send(pool, user_id, "POST", workspace_id, "", Some(body)).await;
    assert_eq!(status, StatusCode::CREATED, "{page}");
    page["id"].as_str().unwrap().parse().unwrap()
}

/// A document at the root, or under `parent`.
async fn document(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    parent: Option<Uuid>,
    title: &str,
) -> Uuid {
    create(
        pool,
        user_id,
        workspace_id,
        json!({ "type": "document", "parentId": parent, "title": title }),
    )
    .await
}

/// The titles of the live tree, each with its parent's title, in the order the tree gives them.
async fn tree(pool: &PgPool, user_id: Uuid, workspace_id: Uuid) -> Vec<(Option<String>, String)> {
    let (status, nodes) = send(pool, user_id, "GET", workspace_id, "", None).await;
    assert_eq!(status, StatusCode::OK);

    let nodes = nodes.as_array().unwrap();
    let title_of = |id: &Value| {
        nodes
            .iter()
            .find(|node| &node["id"] == id)
            .map(|node| node["title"].as_str().unwrap().to_owned())
    };
    nodes
        .iter()
        .map(|node| {
            (
                title_of(&node["parentId"]),
                node["title"].as_str().unwrap().to_owned(),
            )
        })
        .collect()
}

fn titles(pairs: &[(Option<&str>, &str)]) -> Vec<(Option<String>, String)> {
    pairs
        .iter()
        .map(|(parent, title)| (parent.map(str::to_owned), title.to_string()))
        .collect()
}

async fn edit(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    page_id: Uuid,
    base_version: i64,
    set: Value,
) -> (StatusCode, Value) {
    let body = json!({ "baseVersion": base_version, "set": set });
    send(
        pool,
        user_id,
        "PATCH",
        workspace_id,
        &format!("/{page_id}"),
        Some(body),
    )
    .await
}

async fn move_to(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    page_id: Uuid,
    parent: Option<Uuid>,
    index: u32,
) -> (StatusCode, Value) {
    let body = json!({ "parentId": parent, "index": index });
    send(
        pool,
        user_id,
        "POST",
        workspace_id,
        &format!("/{page_id}/move"),
        Some(body),
    )
    .await
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn pages_are_created_last_among_their_siblings_each_with_a_body(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;

    let product = create(
        &pool,
        owner,
        workspace,
        json!({ "type": "group", "title": "  Product " }),
    )
    .await;
    document(&pool, owner, workspace, Some(product), "Requirements").await;
    document(&pool, owner, workspace, Some(product), "Roadmap").await;
    document(&pool, owner, workspace, None, "Handbook").await;

    assert_eq!(
        tree(&pool, owner, workspace).await,
        titles(&[
            (None, "Product"),
            (None, "Handbook"),
            (Some("Product"), "Requirements"),
            (Some("Product"), "Roadmap"),
        ])
    );

    // A group too: changing the type of an empty page never makes or drops a body
    let bodies: i64 =
        sqlx::query_scalar("SELECT count(*) FROM page_bodies WHERE workspace_id = $1")
            .bind(workspace)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(bodies, 4);
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn a_client_made_id_makes_the_request_safe_to_repeat(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;
    let id = Uuid::now_v7();
    let body = json!({ "id": id, "shortId": "4fGh7JkLmN", "type": "document" });

    let (first, page) = send(&pool, owner, "POST", workspace, "", Some(body.clone())).await;
    let (again, same) = send(&pool, owner, "POST", workspace, "", Some(body)).await;

    assert_eq!((first, again), (StatusCode::CREATED, StatusCode::OK));
    assert_eq!(page["shortId"], json!("4fGh7JkLmN"));
    assert_eq!(same["id"], page["id"]);
    assert_eq!(tree(&pool, owner, workspace).await.len(), 1);

    // Someone else's id, or a short id that is taken
    let other = test_app::member_of(&pool, workspace).await;
    let (status, error) = send(
        &pool,
        other,
        "POST",
        workspace,
        "",
        Some(json!({ "id": id, "type": "document" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(error["errors"][0]["field"], json!("id"));

    let taken = json!({ "id": Uuid::now_v7(), "shortId": "4fGh7JkLmN", "type": "document" });
    let (status, error) = send(&pool, owner, "POST", workspace, "", Some(taken)).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(error["errors"][0]["field"], json!("shortId"));
    assert_eq!(error["errors"][0]["code"], json!("TAKEN"));
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn refuses_bad_fields_a_parent_from_elsewhere_and_the_13th_level(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;
    let elsewhere = workspace_of(&pool, owner, "elsewhere").await;
    let foreign = document(&pool, owner, elsewhere, None, "Foreign").await;

    let bad = json!({
        "type": "document",
        "title": "x".repeat(201),
        "icon": { "kind": "lucide", "value": "Not A Name" },
        "shortId": "0OIl",
    });
    let (status, error) = send(&pool, owner, "POST", workspace, "", Some(bad)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(error["errors"].as_array().unwrap().len(), 3);

    let (status, error) = send(
        &pool,
        owner,
        "POST",
        workspace,
        "",
        Some(json!({ "type": "document", "parentId": foreign })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(error["errors"][0]["field"], json!("parentId"));

    let mut parent = None;
    for level in 1..=12 {
        parent = Some(document(&pool, owner, workspace, parent, &format!("Level {level}")).await);
    }
    let (status, error) = send(
        &pool,
        owner,
        "POST",
        workspace,
        "",
        Some(json!({ "type": "document", "parentId": parent })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(error["code"], json!("PAGE_TOO_DEEP"));
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn a_guest_sees_no_pages(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;
    let page = document(&pool, owner, workspace, None, "Handbook").await;
    let guest = guest_of(&pool, workspace).await;

    assert!(tree(&pool, guest, workspace).await.is_empty());
    let (status, _) = edit(&pool, guest, workspace, page, 1, json!({ "title": "Mine" })).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = send(
        &pool,
        guest,
        "POST",
        workspace,
        "",
        Some(json!({ "type": "document" })),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn an_edit_sets_title_and_icon_and_conflicts_only_on_the_same_field(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;
    let page = document(&pool, owner, workspace, None, "Draft").await;

    let (status, body) = edit(
        &pool,
        owner,
        workspace,
        page,
        1,
        json!({ "title": " Q3 plan " }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        (body["title"].clone(), body["version"].clone()),
        (json!("Q3 plan"), json!(2))
    );

    // The same version, another field: goes through
    let icon = json!({ "kind": "emoji", "value": "📘" });
    let (status, body) = edit(&pool, owner, workspace, page, 1, json!({ "icon": icon })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["icon"], icon);

    let (status, body) = edit(
        &pool,
        owner,
        workspace,
        page,
        1,
        json!({ "title": "Other" }),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["params"]["conflicts"][0]["field"], json!("title"));

    let (status, body) = edit(&pool, owner, workspace, page, 3, json!({ "icon": null })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["icon"], Value::Null);
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn the_type_changes_only_while_the_page_is_empty(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;
    let page = document(&pool, owner, workspace, None, "Titled is still empty").await;

    let (status, body) = edit(&pool, owner, workspace, page, 1, json!({ "type": "board" })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["type"], json!("board"));

    // Someone wrote in its body
    sqlx::query("INSERT INTO page_body_updates (doc_id, seq, \"update\") VALUES ($1, 1, '\\x00')")
        .bind(page)
        .execute(&pool)
        .await
        .unwrap();
    let (status, body) = edit(&pool, owner, workspace, page, 2, json!({ "type": "group" })).await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["code"], json!("PAGE_NOT_EMPTY"));

    // Or it has a child
    let group = create(&pool, owner, workspace, json!({ "type": "group" })).await;
    document(&pool, owner, workspace, Some(group), "Child").await;
    let (status, body) = edit(
        &pool,
        owner,
        workspace,
        group,
        1,
        json!({ "type": "document" }),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(body["code"], json!("PAGE_NOT_EMPTY"));
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn a_move_reorders_reparents_and_never_goes_under_itself(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;
    let a = document(&pool, owner, workspace, None, "A").await;
    let b = document(&pool, owner, workspace, None, "B").await;
    let c = document(&pool, owner, workspace, None, "C").await;

    // C first; the index counts the siblings without C
    let (status, _) = move_to(&pool, owner, workspace, c, None, 0).await;
    assert_eq!(status, StatusCode::OK);
    // B under A
    move_to(&pool, owner, workspace, b, Some(a), 0).await;
    assert_eq!(
        tree(&pool, owner, workspace).await,
        titles(&[(None, "C"), (None, "A"), (Some("A"), "B")])
    );

    let (status, body) = move_to(&pool, owner, workspace, a, Some(b), 0).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], json!("PAGE_CYCLE"));
    let (status, body) = move_to(&pool, owner, workspace, a, Some(a), 0).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], json!("PAGE_CYCLE"));

    // Where it already is: no new version
    let (status, body) = move_to(&pool, owner, workspace, c, None, 0).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["version"], json!(2));
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn a_move_counts_the_depth_of_the_whole_subtree(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;

    let mut deep = None;
    for level in 1..=10 {
        deep = Some(document(&pool, owner, workspace, deep, &format!("Level {level}")).await);
    }
    let subtree = document(&pool, owner, workspace, None, "Subtree").await;
    let child = document(&pool, owner, workspace, Some(subtree), "Child").await;
    document(&pool, owner, workspace, Some(child), "Grandchild").await;

    // Three levels under level 10 would end at 13
    let (status, body) = move_to(&pool, owner, workspace, subtree, deep, 0).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], json!("PAGE_TOO_DEEP"));
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn siblings_out_of_room_get_new_keys_in_the_same_order(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;
    let a = document(&pool, owner, workspace, None, "A").await;
    let b = document(&pool, owner, workspace, None, "B").await;
    let c = document(&pool, owner, workspace, None, "C").await;

    // Two pages placed at once got the same key: there is no room between them
    sqlx::query(
        "UPDATE pages SET position = (SELECT position FROM pages WHERE id = $1) WHERE id = $2",
    )
    .bind(a)
    .bind(b)
    .execute(&pool)
    .await
    .unwrap();

    let (status, _) = move_to(&pool, owner, workspace, c, None, 1).await;
    assert_eq!(status, StatusCode::OK);

    let order = tree(&pool, owner, workspace).await;
    let between = order[1].1.clone();
    assert_eq!(between, "C", "{order:?}");
    let keys: Vec<String> =
        sqlx::query_scalar("SELECT position FROM pages WHERE workspace_id = $1 ORDER BY position")
            .bind(workspace)
            .fetch_all(&pool)
            .await
            .unwrap();
    assert!(keys.windows(2).all(|pair| pair[0] < pair[1]), "{keys:?}");
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn a_delete_trashes_the_subtree_and_a_restore_brings_back_what_it_took(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;
    let product = document(&pool, owner, workspace, None, "Product").await;
    let roadmap = document(&pool, owner, workspace, Some(product), "Roadmap").await;
    let old = document(&pool, owner, workspace, Some(roadmap), "Old notes").await;

    // Trashed apart, before
    let (status, _) = send(&pool, owner, "DELETE", workspace, &format!("/{old}"), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = send(
        &pool,
        owner,
        "DELETE",
        workspace,
        &format!("/{product}"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert!(tree(&pool, owner, workspace).await.is_empty());

    // Not on its own: with its parent
    let (status, _) = send(
        &pool,
        owner,
        "POST",
        workspace,
        &format!("/{roadmap}/restore"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    let (status, body) = send(
        &pool,
        owner,
        "POST",
        workspace,
        &format!("/{product}/restore"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["restoredToRoot"], json!(false));

    assert_eq!(
        tree(&pool, owner, workspace).await,
        titles(&[(None, "Product"), (Some("Product"), "Roadmap")])
    );
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn a_page_whose_parent_is_in_the_trash_is_restored_at_the_root(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;
    let product = document(&pool, owner, workspace, None, "Product").await;
    let roadmap = document(&pool, owner, workspace, Some(product), "Roadmap").await;

    send(
        &pool,
        owner,
        "DELETE",
        workspace,
        &format!("/{roadmap}"),
        None,
    )
    .await;
    send(
        &pool,
        owner,
        "DELETE",
        workspace,
        &format!("/{product}"),
        None,
    )
    .await;

    let (status, body) = send(
        &pool,
        owner,
        "POST",
        workspace,
        &format!("/{roadmap}/restore"),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["restoredToRoot"], json!(true));
    assert_eq!(
        tree(&pool, owner, workspace).await,
        titles(&[(None, "Roadmap")])
    );
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn by_short_id_opens_a_trashed_page_too_but_not_another_workspaces(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;
    let elsewhere = workspace_of(&pool, owner, "elsewhere").await;
    let page = create(
        &pool,
        owner,
        workspace,
        json!({ "type": "document", "shortId": "4fGh7JkLmN" }),
    )
    .await;
    send(&pool, owner, "DELETE", workspace, &format!("/{page}"), None).await;

    let (status, body) = send(&pool, owner, "GET", workspace, "/by-short/4fGh7JkLmN", None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["deletedAt"].is_string());
    assert_eq!(body["deletedRoot"], json!(page.to_string()));

    let (status, _) = send(&pool, owner, "GET", elsewhere, "/by-short/4fGh7JkLmN", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "needs DATABASE_URL to a disposable Postgres"]
async fn changes_signal_the_workspace_with_the_tree_only_when_it_shows_them(pool: PgPool) {
    let owner = user(&pool).await;
    let workspace = workspace_of(&pool, owner, "verso-team").await;
    let tab = Uuid::now_v7();
    let signal = |kind: &str, tags: Vec<String>| Sent {
        topic: format!("workspace:{workspace}"),
        event: "data.changed".into(),
        payload: json!({ "type": kind, "tags": tags, "origin": tab.to_string() }),
    };

    let id = Uuid::now_v7();
    let (status, sent) = test_app::send_from(
        &pool,
        tab,
        owner,
        "POST",
        workspace,
        "/pages",
        Some(json!({ "id": id, "type": "document" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(
        sent,
        [signal(
            "page.created",
            vec![format!("tree:{workspace}"), format!("page:{id}")]
        )]
    );

    // Only the page's own tag: nothing the tree draws changed. Here nothing changed at all
    let (_, sent) = test_app::send_from(
        &pool,
        tab,
        owner,
        "PATCH",
        workspace,
        &format!("/pages/{id}"),
        Some(json!({ "baseVersion": 1, "set": { "title": "" } })),
    )
    .await;
    assert!(sent.is_empty());

    let (_, sent) = test_app::send_from(
        &pool,
        tab,
        owner,
        "PATCH",
        workspace,
        &format!("/pages/{id}"),
        Some(json!({ "baseVersion": 1, "set": { "title": "Q3" } })),
    )
    .await;
    assert_eq!(
        sent,
        [signal(
            "page.updated",
            vec![format!("page:{id}"), format!("tree:{workspace}")]
        )]
    );
}
