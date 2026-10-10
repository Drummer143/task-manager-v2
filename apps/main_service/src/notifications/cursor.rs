use std::fmt;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, de};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Cursor {
    pub at: DateTime<Utc>,
    pub id: Uuid,
}

impl Cursor {
    pub fn parse(s: &str) -> Option<Self> {
        let (micros, id) = s.split_once('_')?;
        Some(Self {
            at: DateTime::from_timestamp_micros(micros.parse().ok()?)?,
            id: id.parse().ok()?,
        })
    }
}

impl fmt::Display for Cursor {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}_{}", self.at.timestamp_micros(), self.id)
    }
}

impl<'de> Deserialize<'de> for Cursor {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Self::parse(&s).ok_or_else(|| de::Error::custom("invalid cursor"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_back_what_it_writes() {
        let cursor = Cursor {
            at: DateTime::parse_from_rfc3339("2026-10-03T10:00:00.123456Z")
                .unwrap()
                .to_utc(),
            id: Uuid::now_v7(),
        };

        assert_eq!(Cursor::parse(&cursor.to_string()), Some(cursor));
    }

    #[test]
    fn rejects_anything_else() {
        for s in [
            "",
            "_",
            "123",
            "abc_00000000-0000-0000-0000-000000000000",
            "123_not-a-uuid",
        ] {
            assert_eq!(Cursor::parse(s), None, "{s:?}");
        }
    }
}
