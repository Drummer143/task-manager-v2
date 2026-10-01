Explanation of nested Options in Update DTOs

| JSON Input       | Rust Value        | Database Action                                                    |
| ---------------- | ----------------- | ------------------------------------------------------------------ |
| {}               | None              | Field is missing. Column is ignored and remains unmodified.        |
| {"field": null}  | Some(None)        | Explicit null provided. Database value is cleared (set to `NULL`). |
| {"field": "val"} | Some(Some("val")) | Non-null value provided. Database value is updated to `val`.       |
