use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use anyhow::{Context, bail};

const DEFAULT_PORT: u16 = 8080;
const DEFAULT_MAX_CONNECTIONS: u32 = 10;

#[derive(Debug)]
pub struct Config {
    pub database_url: String,
    pub database_max_connections: u32,
    pub addr: SocketAddr,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Self::from_lookup(|key| std::env::var(key).ok())
    }

    fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> anyhow::Result<Self> {
        let Some(database_url) = lookup("DATABASE_URL").filter(|v| !v.is_empty()) else {
            bail!("DATABASE_URL is required");
        };

        let host: IpAddr = parse_or(
            &lookup,
            "MAIN_SERVICE_HOST",
            IpAddr::V4(Ipv4Addr::UNSPECIFIED),
        )?;
        let port = parse_or(&lookup, "MAIN_SERVICE_PORT", DEFAULT_PORT)?;
        let database_max_connections =
            parse_or(&lookup, "DATABASE_MAX_CONNECTIONS", DEFAULT_MAX_CONNECTIONS)?;

        Ok(Self {
            database_url,
            database_max_connections,
            addr: SocketAddr::new(host, port),
        })
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

    #[test]
    fn requires_database_url() {
        assert!(config(&[]).is_err());
        assert!(config(&[("DATABASE_URL", "")]).is_err());
    }

    #[test]
    fn applies_defaults() {
        let config = config(&[("DATABASE_URL", "postgres://localhost/db")]).unwrap();

        assert_eq!(config.addr, SocketAddr::from(([0, 0, 0, 0], DEFAULT_PORT)));
        assert_eq!(config.database_max_connections, DEFAULT_MAX_CONNECTIONS);
    }

    #[test]
    fn reads_overrides() {
        let config = config(&[
            ("DATABASE_URL", "postgres://localhost/db"),
            ("MAIN_SERVICE_HOST", "127.0.0.1"),
            ("MAIN_SERVICE_PORT", "9090"),
            ("DATABASE_MAX_CONNECTIONS", "3"),
        ])
        .unwrap();

        assert_eq!(config.addr, SocketAddr::from(([127, 0, 0, 1], 9090)));
        assert_eq!(config.database_max_connections, 3);
    }

    #[test]
    fn rejects_invalid_values() {
        let base = ("DATABASE_URL", "postgres://localhost/db");

        assert!(config(&[base, ("MAIN_SERVICE_PORT", "http")]).is_err());
        assert!(config(&[base, ("MAIN_SERVICE_HOST", "localhost:1")]).is_err());
    }
}
