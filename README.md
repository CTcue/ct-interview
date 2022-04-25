# CTcue code interview

In this interview we would like you to read the code and reason about it's purpose.

CTcue offers a query builder to search patient events by category. The events have values, such as a `description`, `specialism`, `text content` and `start_date` that can be filtered on and exported. In addition, we allow groups, so the user can specify `AND`, `ANY` or `NOT` requirements. We have added two stripped down pieces of code:
- A `getDataCollectorQuery()` function, which we use to fetch the query from our PostgreSQL database.
- A `QueryTreeContainer` class, which we use to convert the criteria to an ElasticSearch query (in JSON).

**Example input**

```sql
(
    (query.medication.name = 'ATORVASTATINE') OR
    (query.measurement.name = LDL AND query.measurement.value < 1.81 AND query.measurement.unit = 'mmol/l')
)
AND NOT
(query.report.text contains 'Diabetes type I')
```

