use sql_models::asset::model::{Asset, AssetVisibility};
use uuid::Uuid;

use crate::assets::owner::Owner;

/// A pending asset: the upload is allowed, the file is not there yet.
pub struct NewAsset<'a> {
    pub id: Uuid,
    pub owner: Owner,
    pub name: &'a str,
    pub size: i64,
    pub hash: &'a str,
    pub visibility: AssetVisibility,
    pub created_by: Uuid,
}

pub struct AssetsRepository;

impl AssetsRepository {
    /// `None` when an asset with this id already exists.
    pub async fn create_pending(
        pool: &sqlx::PgPool,
        asset: NewAsset<'_>,
    ) -> Result<Option<Asset>, sqlx::Error> {
        sqlx::query_as::<_, Asset>(
            "INSERT INTO assets
               (id, workspace_id, owner_type, owner_id, name, size, hash, visibility, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO NOTHING
             RETURNING *",
        )
        .bind(asset.id)
        .bind(asset.owner.workspace_id())
        .bind(asset.owner.kind)
        .bind(asset.owner.id)
        .bind(asset.name)
        .bind(asset.size)
        .bind(asset.hash)
        .bind(asset.visibility)
        .bind(asset.created_by)
        .fetch_optional(pool)
        .await
    }

    pub async fn get(pool: &sqlx::PgPool, id: Uuid) -> Result<Option<Asset>, sqlx::Error> {
        sqlx::query_as::<_, Asset>("SELECT * FROM assets WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    /// Backs a pending asset with its blob. `None` when it is not pending (anymore).
    pub async fn complete(
        pool: &sqlx::PgPool,
        id: Uuid,
        blob_id: Uuid,
    ) -> Result<Option<Asset>, sqlx::Error> {
        sqlx::query_as::<_, Asset>(
            "UPDATE assets
             SET blob_id = $2, status = 'ready', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND status = 'pending'
             RETURNING *",
        )
        .bind(id)
        .bind(blob_id)
        .fetch_optional(pool)
        .await
    }

    /// The ready ones among `ids`; unknown and pending ids are left out.
    pub async fn get_ready(pool: &sqlx::PgPool, ids: &[Uuid]) -> Result<Vec<Asset>, sqlx::Error> {
        sqlx::query_as::<_, Asset>("SELECT * FROM assets WHERE id = ANY($1) AND status = 'ready'")
            .bind(ids)
            .fetch_all(pool)
            .await
    }

    /// Which of `blob_ids` an asset still uses.
    pub async fn used_blobs(
        pool: &sqlx::PgPool,
        blob_ids: &[Uuid],
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        sqlx::query_scalar("SELECT DISTINCT blob_id FROM assets WHERE blob_id = ANY($1)")
            .bind(blob_ids)
            .fetch_all(pool)
            .await
    }

    /// Removes uploads that were allowed but never completed, older than `hours`.
    pub async fn delete_abandoned(pool: &sqlx::PgPool, hours: i32) -> Result<u64, sqlx::Error> {
        sqlx::query(
            "DELETE FROM assets
             WHERE status = 'pending' AND created_at < CURRENT_TIMESTAMP - make_interval(hours => $1)",
        )
        .bind(hours)
        .execute(pool)
        .await
        .map(|result| result.rows_affected())
    }
}

// Needs a disposable Postgres; `#[sqlx::test]` creates a fresh database per test there:
//   DATABASE_URL=postgres://test:test@127.0.0.1:55432/postgres cargo test -p main_service -- --ignored
// Never point it at a shared database.
#[cfg(test)]
mod tests {
    use sql_models::asset::model::{AssetOwnerType, AssetStatus};
    use sqlx::PgPool;

    use super::*;

    const HASH: &str = "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262";
    const WS: Uuid = Uuid::from_u128(0x0a);

    async fn user(pool: &PgPool) -> Uuid {
        let id = Uuid::now_v7();
        sqlx::query("INSERT INTO users (id, username) VALUES ($1, 'test')")
            .bind(id)
            .execute(pool)
            .await
            .unwrap();
        id
    }

    /// What storage writes when a file is stored.
    async fn blob(pool: &PgPool, hash: &str) -> Uuid {
        sqlx::query_scalar(
            "INSERT INTO blobs (hash, size, path, mime_type)
             VALUES ($1, 10, '/static/x', 'image/png') RETURNING id",
        )
        .bind(hash)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn pending(pool: &PgPool, user_id: Uuid) -> Asset {
        crate::test_support::ensure_workspace(pool, WS).await;
        AssetsRepository::create_pending(
            pool,
            NewAsset {
                id: Uuid::now_v7(),
                owner: Owner {
                    kind: AssetOwnerType::WorkspaceIcon,
                    id: WS,
                },
                name: "icon.png",
                size: 10,
                hash: HASH,
                visibility: AssetVisibility::Public,
                created_by: user_id,
            },
        )
        .await
        .unwrap()
        .unwrap()
    }

    async fn created_hours_ago(pool: &PgPool, id: Uuid, hours: i32) {
        sqlx::query(
            "UPDATE assets SET created_at = CURRENT_TIMESTAMP - make_interval(hours => $2) WHERE id = $1",
        )
        .bind(id)
        .bind(hours)
        .execute(pool)
        .await
        .unwrap();
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_new_asset_waits_for_its_file_in_its_owners_workspace(pool: PgPool) {
        let user_id = user(&pool).await;

        let asset = pending(&pool, user_id).await;

        assert_eq!(asset.status, AssetStatus::Pending);
        assert_eq!(asset.blob_id, None);
        assert_eq!(asset.workspace_id, Some(WS));
        assert_eq!(asset.owner_id, WS);
        assert_eq!(asset.created_by, Some(user_id));
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn the_same_id_is_not_created_twice(pool: PgPool) {
        let user_id = user(&pool).await;
        let asset = pending(&pool, user_id).await;

        let again = AssetsRepository::create_pending(
            &pool,
            NewAsset {
                id: asset.id,
                owner: Owner {
                    kind: AssetOwnerType::WorkspaceIcon,
                    id: WS,
                },
                name: "other.png",
                size: 10,
                hash: HASH,
                visibility: AssetVisibility::Public,
                created_by: user_id,
            },
        )
        .await
        .unwrap();

        assert!(again.is_none());
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn completing_backs_it_with_the_blob_once(pool: PgPool) {
        let user_id = user(&pool).await;
        let asset = pending(&pool, user_id).await;
        let blob_id = blob(&pool, HASH).await;

        let ready = AssetsRepository::complete(&pool, asset.id, blob_id)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(ready.status, AssetStatus::Ready);
        assert_eq!(ready.blob_id, Some(blob_id));
        assert!(
            AssetsRepository::complete(&pool, asset.id, blob_id)
                .await
                .unwrap()
                .is_none()
        );
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn only_ready_assets_are_served(pool: PgPool) {
        let user_id = user(&pool).await;
        let waiting = pending(&pool, user_id).await;
        let done = pending(&pool, user_id).await;
        AssetsRepository::complete(&pool, done.id, blob(&pool, HASH).await)
            .await
            .unwrap();

        let ready = AssetsRepository::get_ready(&pool, &[waiting.id, done.id, Uuid::now_v7()])
            .await
            .unwrap();

        assert_eq!(ready.iter().map(|a| a.id).collect::<Vec<_>>(), [done.id]);
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn a_blob_is_needed_while_an_asset_uses_it(pool: PgPool) {
        let user_id = user(&pool).await;
        let used = blob(&pool, HASH).await;
        let unused = blob(&pool, &"0".repeat(64)).await;
        let asset = pending(&pool, user_id).await;
        AssetsRepository::complete(&pool, asset.id, used)
            .await
            .unwrap();

        let needed = AssetsRepository::used_blobs(&pool, &[used, unused])
            .await
            .unwrap();
        assert_eq!(needed, [used]);

        // storage's cleanup cannot remove it from under the asset either
        let deleted = sqlx::query("DELETE FROM blobs WHERE id = $1")
            .bind(used)
            .execute(&pool)
            .await;
        assert!(deleted.is_err());
    }

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "needs DATABASE_URL to a disposable Postgres"]
    async fn abandoned_uploads_go_after_a_day_finished_ones_stay(pool: PgPool) {
        let user_id = user(&pool).await;
        let fresh = pending(&pool, user_id).await;
        let abandoned = pending(&pool, user_id).await;
        let old_but_done = pending(&pool, user_id).await;
        AssetsRepository::complete(&pool, old_but_done.id, blob(&pool, HASH).await)
            .await
            .unwrap();
        created_hours_ago(&pool, abandoned.id, 25).await;
        created_hours_ago(&pool, old_but_done.id, 25).await;

        let removed = AssetsRepository::delete_abandoned(&pool, 24).await.unwrap();

        assert_eq!(removed, 1);
        assert!(
            AssetsRepository::get(&pool, abandoned.id)
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            AssetsRepository::get(&pool, fresh.id)
                .await
                .unwrap()
                .is_some()
        );
        assert!(
            AssetsRepository::get(&pool, old_but_done.id)
                .await
                .unwrap()
                .is_some()
        );
    }
}
