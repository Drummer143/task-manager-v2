use sql_models::blobs::model::Blob;
use uuid::Uuid;

use super::dto::CreateBlobDto;

pub struct BlobsRepository;

impl BlobsRepository {
    pub async fn create<'a>(
        executor: impl sqlx::Executor<'a, Database = sqlx::Postgres>,
        dto: CreateBlobDto,
    ) -> Result<Blob, sqlx::Error> {
        sqlx::query_as::<_, Blob>(
            "INSERT INTO blobs (hash, size, path, mime_type) VALUES ($1, $2, $3, $4) RETURNING *",
        )
        .bind(dto.hash)
        .bind(dto.size)
        .bind(dto.path)
        .bind(dto.mime_type)
        .fetch_one(executor)
        .await
    }

    pub async fn get_one_by_id<'a>(
        executor: impl sqlx::Executor<'a, Database = sqlx::Postgres>,
        id: Uuid,
    ) -> Result<Blob, sqlx::Error> {
        sqlx::query_as::<_, Blob>("SELECT * FROM blobs WHERE id = $1")
            .bind(id)
            .fetch_one(executor)
            .await
    }

    pub async fn get_one_by_hash<'a>(
        executor: impl sqlx::Executor<'a, Database = sqlx::Postgres>,
        hash: &str,
    ) -> Result<Blob, sqlx::Error> {
        sqlx::query_as::<_, Blob>("SELECT * FROM blobs WHERE hash = $1")
            .bind(hash)
            .fetch_one(executor)
            .await
    }

    pub async fn get_all_blob_ids<'a>(
        executor: impl sqlx::Executor<'a, Database = sqlx::Postgres>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        #[derive(sqlx::FromRow)]
        struct BlobIdRow {
            id: Uuid,
        }

        let rows: Vec<BlobIdRow> =
            sqlx::query_as::<_, BlobIdRow>("SELECT id FROM blobs LIMIT $1 OFFSET $2")
                .bind(limit)
                .bind(offset)
                .fetch_all(executor)
                .await?;

        Ok(rows.into_iter().map(|r| r.id).collect())
    }

    pub async fn delete_blobs<'a>(
        executor: impl sqlx::Executor<'a, Database = sqlx::Postgres>,
        ids: &[Uuid],
    ) -> Result<Vec<Blob>, sqlx::Error> {
        if ids.is_empty() {
            return Ok(vec![]);
        }

        let mut query_builder = sqlx::QueryBuilder::new("DELETE FROM blobs WHERE id = ANY(");
        query_builder.push_bind(ids);
        query_builder.push(") RETURNING *");

        query_builder
            .build_query_as::<Blob>()
            .fetch_all(executor)
            .await
    }
}
