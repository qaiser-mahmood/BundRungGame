# Supported schema subset

This is an intentionally restricted interpreter, **not full JSON Schema Draft 2020-12 compliance**. No established JSON Schema validator is a direct dependency. Retaining the dependency-free implementation avoids a new dependency for an offline documentation package. If the schema grows beyond this vocabulary, reconsider an established validator rather than silently extending semantics.

Before instance matching, preflight traverses every property, item, definition and oneOf branch, even unused ones. Unsupported/malformed constructs fail globally; they cannot be swallowed as a nonmatching oneOf alternative.

| Vocabulary | Implemented semantics / limits |
| --- | --- |
| `$schema`, `$id`, `title` | Optional annotations; only the declared 2020-12 dialect URI accepted, without claiming full compliance |
| `$defs`, `$ref` | Own named definitions; direct local `#/$defs/NAME` only, NAME letters/digits/underscore/hyphen; siblings apply too; missing, external, recursive, escaped/nested pointers rejected |
| `oneOf` | Nonempty schema array; exactly one matching branch, including overlap rejection |
| `type` | Object, array, string, boolean, number, integer, null; nonempty unique type arrays allowed; finite numbers, integral numeric values for integer |
| `required`, `properties`, `additionalProperties` | Unique string names, own properties only; default additional properties allowed; boolean additionalProperties only (schema-valued form rejected) |
| `items`, `minItems` | Homogeneous schema-valued items; nonnegative integer minimum; tuple forms rejected |
| `enum`, `const` | Structural JSON equality, object key order ignored and array order retained; nonempty, deeply unique enum; JSON values only |
| `minLength`, `pattern` | Unicode code-point length; Unicode ECMAScript regex; malformed regex rejected |
| `minimum`, `maximum` | Inclusive finite numeric bounds; bounds apply only to numeric instances |

Boolean schemas, arbitrary JSON Pointers, recursive references, formats, allOf/anyOf/not, exclusive bounds, maximum lengths, uniqueItems and other unlisted keywords are unsupported and rejected, including inside otherwise unused definitions. Adding a keyword requires explicit implementation, documentation and negative tests. Contradictory but well-formed constraints simply match no instance. Null is distinct from object; string/numeric constraints do not apply to null when a nullable type allows it.

Knowledge-level checks additionally enforce source bindings, reference/supersession consistency, scoped mechanic classification, narrative incompleteness, structured public-only plays and the unanswered Scenario 21. These are not general JSON Schema features. Tests pin key guards against accidental schema weakening. Automated checks cannot decide the truth of arbitrary prose; human review remains required.
