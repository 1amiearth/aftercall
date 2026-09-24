# คู่มือเชื่อม AI (Claude Code หรือ Codex)

AfterCall สรุปประชุมด้วย Claude Code หรือ Codex ที่ติดตั้งอยู่ในเครื่องคุณ ใช้บัญชี subscription ที่ login ไว้แล้ว ไม่ต้องมี API key และไม่เสียเงินเพิ่มนอกจาก quota ของบัญชี

ส่วนขยาย Chrome สั่งรันโปรแกรมในเครื่องเองไม่ได้ จึงต้องลงทะเบียนตัวกลางเล็กๆ (native host) ให้ Chrome หนึ่งครั้ง ขั้นตอนทั้งหมดใช้เวลาราว 5 นาที

## ต้องมีอะไรบ้าง

- macOS หรือ Linux (ยังไม่รองรับ Windows)
- Google Chrome 116 ขึ้นไป และโหลด AfterCall แบบ unpacked แล้ว (ดู [README](../README.md#ติดตั้งจากซอร์ส))
- [Node.js](https://nodejs.org) 18 ขึ้นไป
- บัญชีอย่างน้อยหนึ่งแบบ
  - **Claude Code:** Claude Pro หรือ Max
  - **Codex:** ChatGPT Plus, Pro, Business หรือ Enterprise

## ขั้นที่ 1 ติดตั้ง CLI แล้ว login

เลือกอย่างใดอย่างหนึ่ง หรือติดตั้งทั้งสองก็ได้

**Claude Code**

```bash
npm install -g @anthropic-ai/claude-code
claude
```

ในหน้าต่าง `claude` พิมพ์ `/login` เลือก login ด้วยบัญชี Claude แล้วพิมพ์ `/exit`

**Codex**

```bash
npm install -g @openai/codex
codex login
```

เลือก Sign in with ChatGPT

เช็กว่าใช้ได้: `claude -p "hi"` หรือ `codex exec "hi"` ต้องได้คำตอบกลับมา

## ขั้นที่ 2 ลงทะเบียน native host ให้ Chrome

1. เปิด Side Panel ของ AfterCall แล้วกดไอคอนเฟือง (ตั้งค่า)
2. ในกล่อง **เชื่อม AI ในเครื่อง** ขั้นที่ 2 มีคำสั่งพร้อม extension ID ของคุณ กด **คัดลอก**
3. เปิดเทอร์มินัล เข้าโฟลเดอร์ `aftercall` แล้ววางคำสั่ง หน้าตาประมาณนี้

```bash
cd ~/path/to/aftercall
native/install.sh abcdefghijklmnopabcdefghijklmnop
```

ถ้าสำเร็จจะเห็น

```text
Installed: ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.aftercall.host.json
  found claude: /opt/homebrew/bin/claude
  found codex: /opt/homebrew/bin/codex
```

หา extension ID เองได้ที่ `chrome://extensions` (เปิด Developer mode) เป็นตัวอักษร a-p 32 ตัวใต้ชื่อ AfterCall

## ขั้นที่ 3 ทดสอบการเชื่อมต่อ

กลับไปหน้าตั้งค่าใน Side Panel

1. **AI ที่ใช้สรุป** เลือก Claude Code หรือ Codex
2. **โมเดล** เลือกจากรายชื่อที่ดึงมาจาก CLI ในเครื่อง (รายชื่อขึ้นหลังเชื่อมสำเร็จ) หรือใช้ **ค่าเริ่มต้นของ CLI**
   - Claude Code: ชื่อพร้อมเวอร์ชัน เช่น Opus 5.5, Sonnet 5, Haiku 4.5 จาก catalog ที่ Claude Code เก็บไว้ใน `~/.claude/cache/model-catalog` ถ้ายังไม่มี (ยังไม่เคยเปิด `claude`) จะเหลือแค่ Fable, Opus, Sonnet, Haiku ที่ชี้ไปรุ่นล่าสุด ถ้าอยากประหยัด quota ใช้ Sonnet หรือ Haiku
   - Codex: รายชื่อตามที่บัญชีคุณใช้ได้ Codex ต้องรันสักครั้งหลัง login ถึงจะมีรายชื่อ
   - เปลี่ยน AI แล้วโมเดลจะกลับเป็นค่าเริ่มต้น เพราะชื่อโมเดลใช้ข้ามกันไม่ได้
3. **Effort** ระดับการคิดของโมเดล ดึงจาก CLI เหมือนกันตามที่แต่ละโมเดลรองรับ (Haiku ไม่มี effort) ยิ่งสูงยิ่งละเอียดแต่ช้าและใช้ quota มากขึ้น เปลี่ยนโมเดลแล้ว effort ที่โมเดลใหม่ไม่รองรับจะกลับเป็นค่าเริ่มต้น
4. กด **ทดสอบการเชื่อมต่อ**

ถ้าเชื่อมสำเร็จ จะขึ้นว่า **เชื่อม Claude Code แล้ว** พร้อมเวอร์ชัน และเช็กลิสต์หน้าแรกข้อ **AI สำหรับสรุป** จะเป็นสีเขียว

## ใช้งาน

1. เข้าห้อง Google Meet เปิด CC (กด `c`) แล้วกด **เริ่มบันทึก** ใน Side Panel
2. จบประชุมกด **หยุด** จะได้ `recording.webm` กับ `transcript.md`
3. กด **สรุปด้วย AI** ในการ์ดการบันทึกล่าสุด รอราว 20 วินาทีถึง 2 นาทีตามความยาวประชุม จะได้ `summary.md` ในโฟลเดอร์เดียวกัน
4. อยากได้สรุปอีกแบบ เปลี่ยน AI, โมเดล หรือ effort ในตั้งค่า แล้วกด **สรุปใหม่**

## แก้ปัญหา

| ข้อความ | สาเหตุ | วิธีแก้ |
|---|---|---|
| ยังไม่ได้เชื่อม | ยังไม่ได้รัน `install.sh` หรือ extension ID ไม่ตรง | ทำขั้นที่ 2 ใหม่ด้วยคำสั่งที่คัดลอกจากหน้าตั้งค่า |
| เชื่อมแล้ว แต่ไม่พบ Claude Code / Codex | ติดตั้ง CLI หลังจากรัน `install.sh` หรือ CLI อยู่นอก `PATH` ตอนรัน | รัน `install.sh` ใหม่ในเทอร์มินัลที่พิมพ์ `claude` หรือ `codex` ได้ |
| ยังไม่ได้ login | CLI ยังไม่ได้ login หรือ session หมดอายุ | ทำขั้นที่ 1 ส่วน login ใหม่ |
| quota หมด | ใช้ครบ limit ของบัญชีในรอบนั้น | รอ limit รีเซ็ต หรือสลับไปใช้อีกตัว |
| ใช้โมเดลนี้ไม่ได้ | แพ็กเกจของบัญชีใช้โมเดลนี้ไม่ได้ | เลือกโมเดลอื่น หรือค่าเริ่มต้นของ CLI |
| เรียก AI ไม่สำเร็จ | เน็ตหลุด หรือ CLI ค้างเกิน 10 นาที | ลองใหม่ |

ย้ายโฟลเดอร์ `aftercall` ไปที่อื่นเมื่อไร extension ID ของ unpacked จะเปลี่ยน ต้องโหลดส่วนขยายใหม่แล้วรัน `install.sh` ใหม่ด้วย ID ใหม่

`install.sh` คัดลอก `host.js` ไปไว้ที่ `~/Library/Application Support/AfterCall` (Linux: `~/.local/share/aftercall`) เพราะ macOS ไม่ให้ Chrome อ่านไฟล์ใน `~/Documents`, `~/Desktop`, `~/Downloads` (อาการ: "Native host has exited") อัปเดต AfterCall แล้วให้รัน `install.sh` ใหม่

## ความเป็นส่วนตัว

- วิดีโอไม่ออกจากเครื่อง
- ตอนกดสรุป transcript จะส่งไป Anthropic (Claude Code) หรือ OpenAI (Codex) ตามเงื่อนไขของบัญชีคุณ ถ้าไม่อยากให้นำไปเทรนโมเดล ให้ปิดที่ [claude.ai/settings/data-privacy-controls](https://claude.ai/settings/data-privacy-controls) หรือ [chatgpt.com](https://chatgpt.com) > Settings > Data controls
- AfterCall เรียก CLI ในโฟลเดอร์ชั่วคราวที่ว่างเปล่า ปิด tools, hooks และ MCP ของ Claude Code และรัน Codex แบบ `read-only` ตัว AI จึงอ่านได้แค่ transcript ที่ส่งไป ไม่แตะไฟล์ในเครื่อง
- AfterCall ไม่อ่านหรือเก็บ token การ login ของคุณ ทุกอย่างผ่าน CLI ทางการ

## ถอนการติดตั้ง

```bash
rm ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.aftercall.host.json   # macOS
rm ~/.config/google-chrome/NativeMessagingHosts/com.aftercall.host.json                        # Linux
```

## ทำงานยังไง

```text
Side Panel กดสรุป
  -> background.js  chrome.runtime.sendNativeMessage('com.aftercall.host', { provider, system, prompt, schema })
  -> run.sh   (สร้างโดย install.sh ตั้ง PATH ให้เจอ node และ CLI)
  -> host.js  (สำเนาของ native/host.js) รัน  claude -p --json-schema ...   หรือ   codex exec --output-schema ...
  -> ส่ง JSON สรุปกลับ -> AfterCall เขียน summary.md
```
