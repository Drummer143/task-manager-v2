//! Fractional keys of siblings (`pages.position`): putting a page between two others changes only
//! its own row. Keys are `loro_fractional_index` bytes in hex; hex keeps their byte order, and the
//! column is `COLLATE "C"`, so Postgres orders them as the library does. Only the server makes
//! keys: the client sends an index.

use loro_fractional_index::FractionalIndex;

/// Longer than this, the siblings get new keys instead (`spread`): keys grow when pages keep
/// going into the same gap.
pub const MAX_LEN: usize = 64;

/// A key between two siblings' keys, either side open. `None` when there is no room: the two are
/// equal (two pages placed at once), or the key would be too long. The siblings then get new
/// keys.
pub fn between(before: Option<&str>, after: Option<&str>) -> Option<String> {
    if let (Some(before), Some(after)) = (before, after)
        && before >= after
    {
        return None;
    }

    let before = before.map(FractionalIndex::from_hex_string);
    let after = after.map(FractionalIndex::from_hex_string);
    let key = FractionalIndex::new(before.as_ref(), after.as_ref())?.to_string();

    (key.len() <= MAX_LEN).then_some(key)
}

/// `count` short keys in order, for siblings that ran out of room.
pub fn spread(count: usize) -> Vec<String> {
    FractionalIndex::generate_n_evenly(None, None, count)
        .expect("open ends always have room")
        .iter()
        .map(ToString::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_key_falls_between_its_neighbours() {
        let first = between(None, None).unwrap();
        let last = between(Some(&first), None).unwrap();
        let middle = between(Some(&first), Some(&last)).unwrap();
        let before_all = between(None, Some(&first)).unwrap();

        assert!(before_all < first && first < middle && middle < last);
    }

    #[test]
    fn no_room_between_equal_keys() {
        let key = between(None, None).unwrap();

        assert_eq!(between(Some(&key), Some(&key)), None);
    }

    #[test]
    fn keys_going_into_one_gap_end_up_too_long() {
        let first = between(None, None).unwrap();
        let mut last = between(Some(&first), None).unwrap();

        let mut gaps = 0;
        while let Some(key) = between(Some(&first), Some(&last)) {
            last = key;
            gaps += 1;
        }

        assert!(gaps > 100, "{gaps}");
    }

    #[test]
    fn spread_keys_are_in_order() {
        let keys = spread(50);

        assert_eq!(keys.len(), 50);
        assert!(keys.windows(2).all(|pair| pair[0] < pair[1]));
        assert!(keys.iter().all(|key| key.len() <= MAX_LEN));
    }
}
