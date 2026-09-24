# Prototype การอ่าน caption และหน้า Meet

Type: prototype
Status: claimed
Blocked by: -

## Question

Content script อ่านหน้า Meet ได้ตามที่ DESIGN.md ต้องการไหม และ selector ชุดแรกคืออะไร

1. ชื่อผู้พูดและข้อความของ caption อยู่ใน DOM ตรงไหน ใช้ selector แบบไหนที่ไม่ผูกกับ class ที่ถูกสุ่มชื่อ
2. Meet แก้ข้อความของช่วงพูดเดิมอย่างไร และกฎ "ปิดช่วงพูดเมื่อเปลี่ยนผู้พูดหรือข้อความนิ่ง 1.5 วินาที" ได้ transcript ภาษาไทยที่ไม่ซ้ำ ไม่ขาดไหม ต้องปรับเวลาไหม
3. caption ของผู้บันทึกแสดงชื่อเป็นอะไร ("คุณ", "You" หรืออื่น) ตามภาษาของ Meet
4. รู้ได้อย่างไรว่า CC เปิดหรือปิดอยู่
5. ส่งข้อความเข้าแชท Meet ได้อย่างไร (เปิดแผงแชท พิมพ์ กดส่ง) โดยไม่รบกวนผู้บันทึก
6. รู้ได้อย่างไรว่าผู้บันทึกออกจากห้องแล้ว (ใช้กับหยุดอัตโนมัติ)

ผลลัพธ์: ตัวอย่าง transcript.md จากประชุมทดสอบ (ไม่มีข้อมูลของคนอื่น) และรายการ selector ชุดแรก

ผู้บันทึกต้องเปิดห้อง Meet จริงและพูดทดสอบ

## Comments

- 2026-09-24 รอบ 1 (Meet ภาษาอังกฤษ ผู้บันทึกเป็น host ของห้องทดสอบ): ยังไม่ได้ caption เลย (ผู้บันทึกหาปุ่ม CC ไม่เจอ)
  - **ออกจากห้อง (ข้อ 6):** ตรวจได้ ปุ่ม `button[aria-label="Leave call"]` หายไป และหน้าขึ้น "You left the meeting / Rejoin" URL ไม่เปลี่ยน
  - **แชท (ข้อ 5):** เปิดแผงด้วย `button[aria-label="Chat with everyone"]` ได้ ช่องพิมพ์คือ `textarea[aria-label="Send a message"]` แต่ prototype หาปุ่มส่งผิด ไปเจอสวิตช์ host `button[role="switch"][aria-label="Let participants send messages"]` ข้อความไม่ถูกส่ง แก้ prototype ให้หาปุ่มส่งใกล้ textarea และข้าม role=switch แล้ว
  - `jsname` ดูคงที่กว่า class ใช้เป็น selector สำรองได้ แต่ aria-label เปลี่ยนตามภาษา Meet
