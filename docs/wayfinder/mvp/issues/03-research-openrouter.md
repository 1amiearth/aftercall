# Research OpenRouter: structured outputs, data policy, errors

Type: research
Status: claimed
Blocked by: -

## Question

ข้อเท็จจริงของ OpenRouter ที่ DESIGN.md ตั้งสมมติฐานไว้ถูกไหม

1. รูปแบบ `response_format: json_schema` ที่ถูกต้อง และ `google/gemini-3.8-flash` รองรับจริงไหม มีข้อจำกัดของ schema อะไรบ้าง
2. `provider: { data_collection: "deny" }` ใช้ได้จริงไหม ถ้าไม่มีผู้ให้บริการที่เข้าเงื่อนไขจะเกิดอะไร
3. status code และหน้าตา error ที่ต้องรับมือ รวมถึงกรณีได้ 200 แต่คำตอบว่างหรือถูกตัด
4. เรียกตรงจาก extension ได้ไหม (CORS) header ที่แนะนำ
5. field ของรายชื่อโมเดลที่ใช้ทำ dropdown และการกรองรุ่นที่ไม่ใช่ข้อความ หรือรุ่น `:batch`

ผลลัพธ์: `docs/research/openrouter.md` บน branch `research/openrouter`

## Comments
