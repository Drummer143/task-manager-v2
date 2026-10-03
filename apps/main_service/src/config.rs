use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use anyhow::{Context, bail};
use axum::http::HeaderValue;

const DEFAULT_PORT: u16 = 8080;
const DEFAULT_MAX_CONNECTIONS: u32 = 10;
/// The frontend dev server; production sets CORS_ORIGINS.
const DEFAULT_CORS_ORIGINS: &str = "http://localhost:1346,http://localhost:80";

#[derive(Debug)]
pub struct Config {
    pub database_url: String,
    pub database_max_connections: u32,
    pub addr: SocketAddr,
    /// Browser origins allowed to call the API (the frontend lives on another host).
    pub cors_origins: Vec<HeaderValue>,
    /// Shared with authentik, which sends it with every user sync webhook.
    pub user_sync_webhook_token: String,
    /// Where the keys that sign access tokens are published, e.g.
    /// `https://auth.example.com/application/o/task-manager/jwks/`.
    pub authentik_jwks_url: String,
    /// The `aud` of access tokens: authentik's client id of the frontend.
    pub authentik_audience: String,
    /// The `iss` of access tokens; checked when set.
    pub authentik_issuer: Option<String>,
    /// Off when running against a shared database (the SSH tunnel to the VPS): migrations of a
    /// local branch must not reach it.
    pub run_migrations: bool,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Self::from_lookup(|key| std::env::var(key).ok())
    }

    fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> anyhow::Result<Self> {
        let database_url = required(&lookup, "DATABASE_URL")?;
        let user_sync_webhook_token = required(&lookup, "USER_SYNC_WEBHOOK_TOKEN")?;
        let run_migrations = parse_or(&lookup, "RUN_MIGRATIONS", true)?;
        let authentik_jwks_url = required(&lookup, "AUTHENTIK_JWKS_URL")?;
        let authentik_audience = required(&lookup, "AUTHENTIK_AUDIENCE")?;
        let authentik_issuer = lookup("AUTHENTIK_ISSUER").filter(|v| !v.is_empty());

        let host: IpAddr = parse_or(
            &lookup,
            "MAIN_SERVICE_HOST",
            IpAddr::V4(Ipv4Addr::UNSPECIFIED),
        )?;
        let port = parse_or(&lookup, "MAIN_SERVICE_PORT", DEFAULT_PORT)?;
        let database_max_connections =
            parse_or(&lookup, "DATABASE_MAX_CONNECTIONS", DEFAULT_MAX_CONNECTIONS)?;

        let cors_origins = lookup("CORS_ORIGINS")
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| DEFAULT_CORS_ORIGINS.to_string())
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(|origin| {
                HeaderValue::from_str(origin)
                    .with_context(|| format!("CORS_ORIGINS has an invalid origin: {origin}"))
            })
            .collect::<anyhow::Result<_>>()?;

        Ok(Self {
            database_url,
            database_max_connections,
            addr: SocketAddr::new(host, port),
            cors_origins,
            user_sync_webhook_token,
            authentik_jwks_url,
            authentik_audience,
            authentik_issuer,
            run_migrations,
        })
    }
}

fn required(lookup: &impl Fn(&str) -> Option<String>, key: &str) -> anyhow::Result<String> {
    match lookup(key).filter(|v| !v.is_empty()) {
        Some(value) => Ok(value),
        None => bail!("{key} is required"),
    }
}

fn parse_or<T>(lookup: &impl Fn(&str) -> Option<String>, key: &str, default: T) -> anyhow::Result<T>
where
    T: std::str::FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    match lookup(key).filter(|v| !v.is_empty()) {
        Some(value) => value.parse().with_context(|| format!("{key} is invalid")),
        None => Ok(default),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    fn config(vars: &[(&str, &str)]) -> anyhow::Result<Config> {
        let vars: HashMap<String, String> = vars
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        Config::from_lookup(|key| vars.get(key).cloned())
    }

    const DB: (&str, &str) = ("DATABASE_URL", "postgres://localhost/db");
    const TOKEN: (&str, &str) = ("USER_SYNC_WEBHOOK_TOKEN", "webhook-token");
    const JWKS: (&str, &str) = ("AUTHENTIK_JWKS_URL", "https://auth.test/jwks/");
    const AUD: (&str, &str) = ("AUTHENTIK_AUDIENCE", "client");

    #[test]
    fn requires_the_database_url_and_the_webhook_token() {
        assert!(config(&[TOKEN, JWKS, AUD]).is_err());
        assert!(config(&[("DATABASE_URL", ""), TOKEN, JWKS, AUD]).is_err());
        assert!(config(&[DB, JWKS, AUD]).is_err());
        assert!(config(&[DB, ("USER_SYNC_WEBHOOK_TOKEN", ""), JWKS, AUD]).is_err());
        assert!(config(&[DB, TOKEN, AUD]).is_err());
        assert!(config(&[DB, TOKEN, JWKS]).is_err());
    }

    #[test]
    fn applies_defaults() {
        let config = config(&[DB, TOKEN, JWKS, AUD]).unwrap();

        assert_eq!(config.addr, SocketAddr::from(([0, 0, 0, 0], DEFAULT_PORT)));
        assert_eq!(config.database_max_connections, DEFAULT_MAX_CONNECTIONS);
        assert_eq!(config.cors_origins.len(), 2);
        assert_eq!(config.user_sync_webhook_token, "webhook-token");
        assert!(config.run_migrations);
        assert_eq!(config.authentik_issuer, None);
    }

    #[test]
    fn reads_overrides() {
        let config = config(&[
            DB,
            TOKEN,
            JWKS,
            AUD,
            ("RUN_MIGRATIONS", "false"),
            ("AUTHENTIK_ISSUER", "https://auth.test/application/o/app/"),
            ("MAIN_SERVICE_HOST", "127.0.0.1"),
            ("MAIN_SERVICE_PORT", "9090"),
            ("DATABASE_MAX_CONNECTIONS", "3"),
            (
                "CORS_ORIGINS",
                "https://example.com, https://app.example.com",
            ),
        ])
        .unwrap();

        assert_eq!(config.addr, SocketAddr::from(([127, 0, 0, 1], 9090)));
        assert_eq!(config.database_max_connections, 3);
        assert!(!config.run_migrations);
        assert_eq!(
            config.authentik_issuer.as_deref(),
            Some("https://auth.test/application/o/app/")
        );
        assert_eq!(
            config.cors_origins,
            ["https://example.com", "https://app.example.com"]
        );
    }

    #[test]
    fn rejects_invalid_values() {
        assert!(config(&[DB, TOKEN, JWKS, AUD, ("MAIN_SERVICE_PORT", "http")]).is_err());
        assert!(config(&[DB, TOKEN, JWKS, AUD, ("MAIN_SERVICE_HOST", "localhost:1")]).is_err());
        assert!(
            config(&[
                DB,
                TOKEN,
                JWKS,
                AUD,
                ("CORS_ORIGINS", "https://exa\nmple.com")
            ])
            .is_err()
        );
        assert!(config(&[DB, TOKEN, JWKS, AUD, ("RUN_MIGRATIONS", "no")]).is_err());
    }
}
