# AfterCall — เอกสารออกแบบ

ส่วนขยาย Google Chrome (Manifest V3) สำหรับ Google Meet  
บันทึกแท็บประชุม ถอดเสียงเป็นข้อความ แล้วสรุปด้วย AI

ใช้สำหรับ Project Manager และทีมที่อยากได้บันทึกประชุม + action items โดยไม่ต้องพึ่งบอทเข้าห้อง และไม่ต้องเป็น host ของ Google Meet

วิดีโอและไฟล์สรุปอยู่บนเครื่องผู้ใช้ Transcript ส่งออกไปเฉพาะตอนขอสรุป และส่งเฉพาะข้อความไปยัง OpenRouter ด้วยโมเดลที่ผู้ใช้เลือกเอง

---

## สิ่งที่ทำได้

- บันทึกแท็บ Google Meet เป็นวิดีโอ (WebM)
- ผสมเสียงไมค์ของผู้ใช้เข้าไปในไฟล์
- ดึง Live Captions ของ Meet มาเป็น transcript สด พร้อมชื่อคนพูดและ timestamp
- สรุปหลังประชุมจบ: ภาพรวม, การตัดสินใจ, action items, ความเสี่ยง
- ดาวน์โหลดวิดีโอ, transcript, สรุป
- ทำงานได้แม้ผู้ใช้กำลัง share screen / present อยู่
- แจ้งในแชท Meet ว่ากำลังบันทึก และปิดการแจ้งได้

ยังไม่ทำในเวอร์ชันแรก

- อัดทั้งเดสก์ท็อปแยกจากแท็บ Meet
- บอทเข้าห้องประชุม
- อัดอัตโนมัติโดยไม่กดเริ่ม
- อัปโหลดไฟล์ขึ้นคลาวด์
- รองรับเบราว์เซอร์อื่นที่ไม่ใช่ Chrome

---

## หลักการอัดภาพ

ค่าเริ่มต้นคืออัด **แท็บ `meet.google.com`** ด้วย `chrome.tabCapture` + Offscreen Document + `MediaRecorder`

Google Meet รวมภาพที่กำลังนำเสนอเข้ามาในหน้าห้องอยู่แล้ว จึงอัดแท็บห้องได้ทั้งคนและสไลด์ในไฟล์เดียว

| สถานการณ์ | อัดแบบไหน | ได้ภาพอะไร |
|---|---|---|
| ประชุมปกติ ไม่ได้แชร์จอ | แท็บ Meet | หน้าคนในห้อง + UI ของ Meet |
| กำลังแชร์แท็บ Chrome | แท็บ Meet | งานนำเสนอที่ Meet ฉาย + คนในห้อง |
| กำลังแชร์หน้าต่างโปรแกรม | แท็บ Meet | หน้าต่างนั้นตามที่ Meet เรนเดอร์ |
| กำลังแชร์ทั้งหน้าจอ | แท็บ Meet | ภาพรวมห้องตามเลย์เอาต์ Meet |

ข้อควรรู้ตอนผู้ใช้เป็นคนนำเสนอ

- ไฟล์อัดได้ภาพตามที่ **ผู้ใช้นั้นเห็นในแท็บ Meet** ไม่ใช่จอต้นทางความละเอียดเต็ม
- ถ้า unpin งานนำเสนอ สไลด์จะเล็กในไฟล์
- แชร์หน้าต่าง Meet เองจะเกิดภาพสะท้อน
- เสียงจากแท็บที่แชร์อยู่ในเสียงห้องเมื่อผู้ใช้ติ๊ก share tab audio
- เสียงไมค์ของผู้ใช้อยู่นอก tab audio ต้อง mix แยกด้วย Web Audio

โหมด “อัดจอที่แชร์โดยตรง” เป็นของระยะหลัง ไม่ใส่ใน MVP

---

## โครงส่วนขยาย

Service worker ของ Manifest V3 อยู่ได้ไม่นาน จึงห้ามถือ `MediaRecorder` ไว้ที่นั่น การอัดทั้งก้อนอยู่ใน Offscreen Document

```text
Side Panel          กด Start / Pause / Stop, ไมค์, การแจ้งในแชท, สถานะเวลา
    │
Service worker      ตรวจแท็บ Meet, ขอ stream id, สั่ง offscreen และ content script
    │
    ├── Offscreen   จับภาพ+เสียงแท็บ, mix ไมค์, อัด WebM
    └── Content     อ่าน Live Captions, ส่งข้อความแจ้งในแชทครั้งเดียวตอนเริ่ม
```

| ส่วน | ไฟล์โดยประมาณ | หน้าที่ |
|---|---|---|
| Side Panel | `src/sidepanel/` | ปุ่มควบคุม, ตัวจับเวลา, สวิตช์ไมค์และแชท, ใส่ OpenRouter API key, เลือกโมเดล |
| Service worker | `src/background.js` | ประสานงานอย่างเดียว ไม่ถือ media stream |
| Offscreen | `src/offscreen/` | `getUserMedia` จาก stream id, Web Audio mix, `MediaRecorder` |
| Content script | `src/content.js` | `MutationObserver` บน captions, พิมพ์แจ้งในช่องแชท Meet |
| สรุป | `src/summary.js` | ประกอบพรอมต์จาก transcript แล้วเรียก OpenRouter ด้วยโมเดลที่เลือก |

`manifest.json` อย่างน้อยต้องมี

- `manifest_version: 3`
- `side_panel` ชี้ไปที่หน้า Side Panel
- `background.service_worker`
- content script ที่ `matches: ["https://meet.google.com/*"]`
- offscreen document สร้างตอนเริ่มอัด ปิดตอน Stop

เทคโนโลยี

- JavaScript ล้วน ES modules + JSDoc ไม่มีขั้น build โหลด unpacked จาก repo ได้ทันที
- ข้อความ UI ไทย + อังกฤษ ผ่าน `chrome.i18n` (`_locales/th`, `_locales/en`) ตั้งแต่แรก
- ทดสอบ logic ล้วน (ตัดช่วงพูด, เวลาในวิดีโอหักช่วงพัก, JSON เป็น `summary.md`, ชื่อโฟลเดอร์) ด้วย `node --test` ไม่มี dependency ส่วนการอัดจริงใช้เช็กลิสต์ใน `CONTRIBUTING.md`

ค่าเริ่มต้นในหน้าตั้งค่า

| ตั้งค่า | ค่าเริ่มต้น |
|---|---|
| OpenRouter API key | ว่าง (บันทึกได้ แต่ข้ามการสรุป) |
| โมเดล | `google/gemini-3.8-flash` |
| ชื่อผู้บันทึก | ว่าง (ใช้แทน "คุณ/You" ใน transcript) |
| ผสมไมค์ | เปิด จำค่าล่าสุด |
| การแจ้งในแชท | เปิด ปิดได้หลังยืนยันคำเตือน |

---

## สิทธิ์ที่ขอ

ขอเท่าที่ใช้ และเขียนเหตุผลนี้ไว้ตอนรีวิวร้านค้า

| สิทธิ์ | ใช้ทำอะไร |
|---|---|
| `sidePanel` | แผงควบคุมบันทึก |
| `tabCapture` | ขอ media stream ของแท็บ Meet |
| `offscreen` | ถือ recorder นอก service worker |
| `activeTab` | รู้ว่าแท็บที่เปิดแผงอยู่คือ Meet |
| `storage` | จำสวิตช์ไมค์, การแจ้งแชท, API key, โมเดลที่เลือก ในเครื่อง |
| `downloads` | เซฟ `.webm`, `.md` ลงเครื่อง |
| host `https://meet.google.com/*` | content script อ่าน captions และส่งแชท |
| host `https://openrouter.ai/*` | เรียก OpenRouter เพื่อสรุป และดึงรายชื่อโมเดล |

ไมค์ไม่ใส่เป็น permission ใน manifest แต่ Offscreen ไม่มีหน้าจอ จึงเด้งขอสิทธิ์ไมค์เองไม่ได้ ครั้งแรกที่ผู้ใช้เปิดสวิตช์ไมค์ ให้เปิดหน้าส่วนขยายที่มองเห็นได้ (เช่น แท็บ `permissions.html`) เรียก `getUserMedia({ audio: true })` ให้ผู้ใช้กดอนุญาต จากนั้น Offscreen ใช้สิทธิ์เดียวกันได้เพราะอยู่ origin ของส่วนขยายเดียวกัน

`tabCapture.getMediaStreamId` เรียกจาก service worker ได้ทันทีเมื่อผู้ใช้กดปุ่ม Start ใน Side Panel ไม่ต้องกดไอคอนส่วนขยายก่อน (ยืนยันแล้วใน prototype ticket 01)

---

## การสรุปด้วย OpenRouter

สรุปผ่าน [OpenRouter](https://openrouter.ai) ที่เดียว ผู้ใช้เลือกโมเดลเองในหน้าตั้งค่า ไม่ผูกกับเจ้าใดเจ้าหนึ่ง

- ผู้ใช้ใส่ OpenRouter API key ของตัวเอง ค่าใช้จ่ายคิดกับบัญชีผู้ใช้
- ดึงรายชื่อโมเดลจาก `GET https://openrouter.ai/api/v1/models` มาให้เลือกใน dropdown
- โมเดลเริ่มต้นคือ `google/gemini-3.8-flash` ใช้ทันทีถ้าผู้ใช้ยังไม่เลือก (รับได้ 1M token, ราคา $0.75 / $3.75 ต่อ 1M token in / out, ประชุม 1 ชม. ราว $0.03)
- เก็บ id ของโมเดลที่ผู้ใช้เลือกไว้ใน `chrome.storage.local` ถ้าไม่มีค่า ใช้โมเดลเริ่มต้น
- ไม่แสดงรุ่นที่ลงท้าย `:batch` ใน dropdown เพราะคำตอบไม่กลับมาทันที
- เรียกสรุปด้วย `POST https://openrouter.ai/api/v1/chat/completions` (รูปแบบเดียวกับ OpenAI Chat Completions) ใส่ `Authorization: Bearer <key>` และ `model` เป็น id ที่เลือก
- ใส่ header `X-OpenRouter-Title: AfterCall` ให้ชื่อแอปขึ้นในหน้าการใช้งานของ OpenRouter (`X-Title` ชื่อเดิมยังใช้ได้)
- เรียกตรงจากส่วนขยายได้ OpenRouter ตอบ CORS `access-control-allow-origin: *` ไม่ต้องมี proxy
- กรองรายชื่อโมเดลใน dropdown ให้เหลือเฉพาะรุ่นที่ `architecture.output_modalities` เป็น `["text"]` และมี `structured_outputs` ใน `supported_parameters`
- ตรวจ `context_length` ของโมเดลจากรายชื่อโมเดล ถ้า transcript ยาวเกิน ให้เตือนผู้ใช้ก่อนส่ง
- ส่ง `provider: { data_collection: "deny" }` ทุกครั้ง ให้ OpenRouter ส่งต่อเฉพาะผู้ให้บริการที่ไม่เก็บข้อมูลไปเทรน

### บังคับโครงสรุปด้วย JSON Schema

ไม่พึ่งพรอมต์อย่างเดียว ส่ง `response_format: { type: "json_schema", json_schema: { strict: true, schema } }` ให้โมเดลตอบเป็น JSON ตามโครง 6 หัวข้อ แล้วส่วนขยายแปลงเป็น `summary.md` เอง หัวข้อจึงครบและเรียงเหมือนกันทุกครั้ง

```json
{
  "brief": "string",
  "topics": ["string"],
  "decisions": ["string"],
  "action_items": [{ "task": "string", "owner": "string", "deadline": "string", "at": "mm:ss" }],
  "risks": ["string"],
  "follow_up_questions": ["string"]
}
```

- ถ้าไม่รู้คนรับหรือเดดไลน์ ให้โมเดลใส่ `"ไม่ระบุ"` ห้ามเดา
- โมเดลที่ผู้ใช้เลือกต้องมี `structured_outputs` ใน `supported_parameters` ของรายชื่อโมเดล ถ้าไม่มี ให้ส่งแบบพรอมต์ธรรมดา แล้วตรวจ JSON ที่ได้ก่อนแปลง

### เมื่อสรุปไม่สำเร็จ

transcript ถูกเซฟลงเครื่องก่อนเรียกสรุปเสมอ สรุปพังข้อมูลก็ไม่หาย

| อาการ | ข้อความใน Side Panel |
|---|---|
| 401 | API key ไม่ถูกต้อง ไปแก้ในหน้าตั้งค่า |
| 402 | เครดิต OpenRouter หมด |
| 429 / 5xx / เน็ตหลุด | เรียกไม่สำเร็จ ลองใหม่ |
| JSON ไม่ตรงโครง | โมเดลตอบผิดรูปแบบ ลองใหม่หรือเปลี่ยนโมเดล |
| 503 ไม่มีผู้ให้บริการที่ไม่เก็บข้อมูล | โมเดลนี้ไม่มีผู้ให้บริการที่ไม่เก็บข้อมูล เปลี่ยนโมเดล |
| 200 แต่มี `error` ใน body หรือ `finish_reason` เป็น `length` | คำตอบไม่ครบ ลองใหม่ |

ห้ามเชื่อ HTTP status อย่างเดียว OpenRouter ตอบ 200 ที่มี `error` ใน body ได้ ต้องเช็ก `body.error` และ `choices[0].finish_reason` ทุกครั้ง error มาในรูป `{ error: { code, message, metadata? } }`

Gemini รับ JSON Schema แค่บางส่วน ให้ schema สรุปตื้นและเล็ก ใช้แค่ `type`, `properties`, `required`, `items`, `enum`

Side Panel มีปุ่ม **สรุปใหม่** ที่เอา transcript ของการบันทึกล่าสุดจาก `chrome.storage.local` ไปสรุปอีกครั้ง เปลี่ยนโมเดลก่อนกดได้ ส่วนขยายจำเฉพาะการบันทึกล่าสุด อยู่รอดหลังปิด Chrome การบันทึกครั้งถัดไปแทนที่ของเดิม

ถ้ายังไม่มี API key ตอนจบการบันทึก ให้ข้ามการสรุป ได้แค่ `recording.webm` กับ `transcript.md` แล้วบอกให้ใส่ key และกดสรุปใหม่

สรุปเขียนเป็นภาษาหลักของการประชุม (โมเดลเลือกจาก transcript) ไม่ใช่ภาษาของ UI

---

## ลำดับตอนกดบันทึก

1. Side Panel ตรวจว่าแท็บปัจจุบันเป็น `meet.google.com` ถ้าไม่ใช่ ปุ่ม Start ใช้ไม่ได้
2. ผู้ใช้กด Start (ต้องเป็นท่าทางของผู้ใช้ Chrome ถึงจะให้จับแท็บและไมค์)
3. Service worker เรียก `chrome.tabCapture.getMediaStreamId` ของแท็บนั้น แล้วเปิด Offscreen
4. Offscreen เอา stream id ไป `getUserMedia` ด้วย `chromeMediaSource: "tab"` ทั้งภาพและเสียง กำหนด `maxWidth: 1920`, `maxHeight: 1080`, `maxFrameRate: 15` ใน `mandatory` ไม่อย่างนั้นอาจได้ภาพความละเอียดต่ำ
5. ส่งเสียงแท็บต่อเข้า `AudioContext.destination` ด้วย เพราะพอจับเสียงแท็บแล้ว Chrome จะปิดเสียงแท็บนั้น ถ้าไม่ต่อกลับ ผู้ใช้จะไม่ได้ยินเสียงห้อง
6. ถ้าเปิดไมค์อยู่ ให้เอาไมค์มาผสมกับเสียงแท็บใน `AudioContext` เดียวกัน ส่งผลลัพธ์ไป `MediaStreamAudioDestinationNode` แล้วรวมกับวิดีโอแท็บเข้า `MediaRecorder` (ไมค์ไม่ต่อเข้า destination ไม่อย่างนั้นผู้ใช้จะได้ยินเสียงตัวเอง) ตั้ง `mimeType: "video/webm;codecs=vp9,opus"` และ `videoBitsPerSecond: 1_500_000` วัดจริงได้ 1920x1080 @ 15fps ราว 180 MB ต่อ 10 นาที (~1.1 GB/ชม.) สไลด์อ่านออก ไม่มีตัวเลือกบิตเรตในหน้าตั้งค่า
7. Content script เริ่มเก็บ caption เป็นบรรทัด `{ t, speaker, text }` และส่งเข้าแชทหนึ่งครั้งถ้าเปิดการแจ้งไว้ บันทึก transcript ลง `chrome.storage.local` เป็นระยะ กันข้อความหายถ้าแท็บ Meet รีโหลดหรือ Chrome ปิด
   - caption ของผู้บันทึกเอง Meet แสดงเป็น "คุณ/You" ให้แทนด้วยชื่อผู้บันทึกจากหน้าตั้งค่า ถ้ายังไม่ตั้ง ใช้ตามที่ Meet แสดง
   - Meet แก้ข้อความ caption เดิมซ้ำหลายรอบระหว่างคนพูด ห้ามเก็บทุกครั้งที่ `MutationObserver` เห็นการเปลี่ยน ให้ถือบรรทัดปัจจุบันไว้ แล้วปิดบรรทัดเมื่อเปลี่ยนคนพูด หรือข้อความนิ่งเกิน 1.5 วินาที
8. `t` คือเวลาในวิดีโอ นับจากตอนเริ่มอัดและหักช่วงที่ Pause ออก เพื่อให้ "นาทีที่พูด" ในสรุปตรงกับวิดีโอ
9. Pause / Resume เรียก `MediaRecorder.pause()` และ `resume()` ตัวจับเวลาและการเก็บ caption หยุดตาม
10. Stop แล้วทำตามลำดับนี้
    1. Offscreen ปิด recorder รวม chunk เป็น Blob แล้วสร้าง blob URL
    2. Offscreen ส่ง blob URL ให้ service worker เพราะ Offscreen เรียก `chrome.downloads` เองไม่ได้
    3. Service worker โหลด `recording.webm` กับ `transcript.md`
    4. ส่งข้อความ transcript ไปสรุป แล้วโหลด `summary.md`
    5. รอให้ `recording.webm` โหลดเสร็จ (`chrome.downloads.onChanged` เป็น `complete`) ค่อยปิด Offscreen เพราะ blob URL จะใช้ไม่ได้ทันทีที่ Offscreen ปิด

ไฟล์ของแต่ละประชุมอยู่โฟลเดอร์ย่อยของตัวเองใน Downloads ตั้งชื่อจากวันที่และรหัสห้องใน URL ไม่ให้ชนกัน (`chrome.downloads.download` รับ `filename` ที่มีโฟลเดอร์ย่อยได้)

```text
Downloads/AfterCall/2026-09-24_1430_abc-defg-hij/
    recording.webm
    transcript.md
    summary.md
```

### หยุดอัตโนมัติ

ถ้าไม่มีใครกด Stop แต่การประชุมจบไปแล้ว ให้ทำขั้น Stop เหมือนผู้ใช้กดเอง ไฟล์จะได้ไม่หาย

- ปิดแท็บ Meet (`chrome.tabs.onRemoved`)
- แท็บเปลี่ยนไปหน้าอื่นที่ไม่ใช่ห้องเดิม (`chrome.tabs.onUpdated`)
- video track ของแท็บจบเอง (event `ended` ใน Offscreen)
- กดวางสายออกจากห้อง Meet (content script เห็นหน้าออกจากห้อง)

### Caption

Caption มีเมื่อผู้ใช้เปิด Live captions (CC) ใน Meet ถ้ายังไม่เปิด การบันทึกเริ่มได้ตามปกติ Side Panel แสดงคำเตือนค้างจนกว่าจะเปิด CC และเริ่มเก็บข้อความทันทีที่เปิด ส่วนขยายไม่กดเปิด CC เอง

ภาษาของ caption ต้องตั้งใน Meet ให้ตรงกับภาษาที่คุยจริง ถ้าตั้งผิด transcript จะเพี้ยนทั้งไฟล์ ตอนกด Start ให้ Side Panel เตือนให้เช็กภาษา caption ประชุมที่คุยไทยปนอังกฤษ ความแม่นของ caption อาจต่ำลง

---

## MVP ที่ต้องทำให้ครบ

1. ตรวจว่าแท็บปัจจุบันเป็น Google Meet
2. กด Start / Pause / Stop จาก Side Panel
3. แสดงสถานะกำลังบันทึก + เวลาที่อัด
4. อัดวิดีโอแท็บ Meet
5. ผสมไมค์ได้ เปิด/ปิดได้
6. ดึง captions สดเป็น transcript
7. เมื่อ Stop แล้วได้ 3 ไฟล์ในโฟลเดอร์ของประชุมนั้น
   - `recording.webm`
   - `transcript.md`
   - `summary.md`
8. แจ้งในแชท Meet ว่ากำลังบันทึก เปิดเป็นค่าเริ่มต้น ปิดได้แต่ต้องยืนยันคำเตือนก่อน
9. วิดีโอไม่ถูกอัปโหลด API key อยู่ที่ `chrome.storage.local` (ไม่ได้เข้ารหัส บอกผู้ใช้ในหน้าตั้งค่า)
10. หน้าตั้งค่าใส่ OpenRouter API key และเลือกโมเดลสรุปจากรายชื่อโมเดลของ OpenRouter ค่าเริ่มต้น `google/gemini-3.8-flash`
11. หยุดอัดและเซฟไฟล์อัตโนมัติเมื่อปิดแท็บหรือออกจากห้อง
12. สรุปพังแล้วบอกสาเหตุ และมีปุ่มสรุปใหม่

โครงสรุปที่ AI ต้องตอบทุกครั้ง (บังคับด้วย JSON Schema ดูหัวข้อ "บังคับโครงสรุปด้วย JSON Schema")

```text
1. สรุปสั้น
2. หัวข้อที่คุย
3. การตัดสินใจ
4. Action items (งาน / คนรับ / เดดไลน์ / นาทีที่พูด)
5. ความเสี่ยง / ของที่ยังไม่ชัด
6. คำถามที่ต้องตามต่อ
```

---

## ความเป็นส่วนตัวและความยินยอม

- Meet ไม่ขึ้นป้ายว่ากำลังอัด เพราะอัดจากฝั่งเบราว์เซอร์ผู้ใช้ ข้อความในแชทจึงเป็นทางเดียวที่คนในห้องจะรู้ การแจ้งจึงเปิดเป็นค่าเริ่มต้น ถ้าผู้ใช้จะปิด ให้ขึ้นคำเตือนว่าการอัดเสียงและภาพผู้อื่นโดยไม่แจ้งอาจขัด PDPA และนโยบายขององค์กร
- ข้อความแจ้งในแชทควรบอกว่าอัดอะไร และจะส่ง transcript ไปสรุปด้วย AI เขียนไทยและอังกฤษในข้อความเดียว เพราะคนในห้องอาจไม่ใช่คนไทย
- transcript ออกนอกเครื่องทางเดียวคือตอนเรียก OpenRouter และขอ `data_collection: "deny"` ทุกครั้ง

### Chrome Web Store

- ส่วนขยายส่ง transcript ออกนอกเครื่อง ร้านค้าจึงบังคับให้มีลิงก์ privacy policy ต้องเตรียมหน้าไว้ก่อนส่งรีวิว บอกว่าเก็บอะไร ส่งไปที่ไหน และไม่เก็บอะไรบนเซิร์ฟเวอร์ของเรา
- กรอก data usage ในหน้า Developer Dashboard ให้ตรงกับ privacy policy
- ใช้เหตุผลของแต่ละสิทธิ์จากตาราง "สิทธิ์ที่ขอ" ตอบคำถามรีวิว

---

## ข้อจำกัดที่รู้แล้ว

- DOM ของ captions และช่องแชท Meet เปลี่ยนได้ การอ่านจอและการส่งแชทพังได้เมื่อ Google ปรับหน้า ทางอัปเกรดคือปรับ selector ใน content script ที่เดียว
- ระหว่างนำเสนอ ไฟล์ได้ภาพเท่าที่แท็บ Meet วาดให้คนอัดเห็น
- Service worker ถูก Chrome ปิดได้กลางคัน สถานะการอัดและความยาวคลิปต้องอยู่ที่ Offscreen แล้วรายงานกลับมาที่แผง
- สรุปใช้ได้เมื่อมี transcript ถ้าปิด CC ทั้งประชุม จะได้วิดีโอกับไฟล์สรุปที่บอกว่าไม่มีข้อความให้สรุป
- WebM จาก `MediaRecorder` ไม่มีความยาวคลิปในไฟล์ ในการทดสอบลากแถบเวลาได้ แต่บางโปรแกรมเล่นอาจลากไม่ได้ ถ้ามีคนเจอ ค่อยใช้ `ts-ebml` เขียนข้อมูลส่วนหัวใหม่หลังอัดเสร็จ
- วิดีโอเก็บเป็น Blob chunk ใน Offscreen จนกว่าจะกด Stop ในการทดสอบหน่วยความจำของ Offscreen นิ่ง ไม่โตตามขนาดไฟล์ จึงไม่ต้องเขียนลง OPFS ระหว่างอัด ประชุม 2 ชม. ต้องมีดิสก์ว่างราว 2.2 GB
- API key ใน `chrome.storage.local` ไม่ได้เข้ารหัส ใครเข้าถึงโปรไฟล์ Chrome ของเครื่องนั้นได้ก็อ่าน key ได้
