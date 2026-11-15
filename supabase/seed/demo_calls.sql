-- Scripted demo calls so the portal is never empty for a reviewer.
-- They are clearly labelled: calls.model = 'seed-script'. Real browser calls carry the live model name.
-- Times are relative to now() so the data always looks recent; slots are always in the future.
-- Re-runnable: removes previous seed rows first.

do $$
declare
  v_clinic uuid := (select id from public.clinics where slug = 'hashi-dental');
  d_farhana uuid := (select id from public.doctors where full_name_en = 'Dr. Farhana Rahman');
  d_tanvir  uuid := (select id from public.doctors where full_name_en = 'Dr. Tanvir Ahmed');
  d_nusrat  uuid := (select id from public.doctors where full_name_en = 'Dr. Nusrat Jahan');
  s_consult uuid := (select id from public.services where code = 'consultation');
  s_scaling uuid := (select id from public.services where code = 'scaling');
  s_braces  uuid := (select id from public.services where code = 'braces');
  today date := (now() at time zone 'Asia/Dhaka')::date;
  next_sun date := today + ((7 - extract(dow from today)::int) % 7) + case when extract(dow from today) = 0 then 7 else 0 end;
  next_mon date := next_sun + 1;
  next_wed date := next_sun + 3;
  next_sat date := next_sun + 6;
  c uuid; p uuid; a uuid;
  t0 timestamptz;

begin
  -- clean previous seed
  delete from public.appointments where call_id in (select id from public.calls where model = 'seed-script')
                                     or updated_by_call_id in (select id from public.calls where model = 'seed-script');
  delete from public.callbacks where call_id in (select id from public.calls where model = 'seed-script');
  delete from public.calls where model = 'seed-script';
  delete from public.patients where phone_e164 in ('+8801819456123','+8801711987654','+8801556321789','+8801912003344','+8801674550012','+8801305778899');

  ------------------------------------------------------------------
  -- 1. Booked: toothache, code-switching, number read-back
  ------------------------------------------------------------------
  t0 := now() - interval '26 hours';
  insert into public.patients (clinic_id, full_name_bn, full_name_en, phone_e164)
    values (v_clinic, 'মোঃ রাকিবুল ইসলাম', 'Md. Rakibul Islam', '+8801819456123') returning id into p;
  insert into public.calls (clinic_id, patient_id, started_at, connected_at, ended_at, status, end_reason, model, session_secret_hash, finalized_at,
      summary_bn, summary_en)
    values (v_clinic, p, t0, t0 + interval '1 second', t0 + interval '2 minutes 48 seconds', 'booked', 'agent_ended', 'seed-script', 'seed', t0 + interval '3 minutes',
      'রাকিবুল ইসলাম দাঁতের ব্যথার জন্য সামনের রবিবার সন্ধ্যা সাড়ে ৬টায় ডা. ফারহানা রহমানের কাছে অ্যাপয়েন্টমেন্ট নিয়েছেন।',
      'Md. Rakibul Islam booked a consultation for toothache with Dr. Farhana Rahman next Sunday at 6:30 pm. Number confirmed digit by digit.')
    returning id into c;
  insert into public.appointments (clinic_id, patient_id, doctor_id, service_id, call_id, updated_by_call_id, slot_start, slot_end, status, reason, ref_code)
    values (v_clinic, p, d_farhana, s_consult, c, c, (next_sun + time '18:30') at time zone 'Asia/Dhaka', (next_sun + time '19:00') at time zone 'Asia/Dhaka', 'booked', 'দাঁতে ব্যথা', '4821');
  insert into public.transcript_turns (call_id, seq, speaker, text_bn, text_en, offset_ms, ts) select c, x.seq, x.sp, x.bn, x.en, x.ms, t0 + x.ms * interval '1 millisecond' from (values
    (0,'agent',2100,'আসসালামু আলাইকুম, হাসি ডেন্টাল কেয়ার থেকে সুমি বলছি — আমি ক্লিনিকের এআই রিসেপশনিস্ট। বলুন, আপনাকে কীভাবে সাহায্য করতে পারি?','Assalamu alaikum, this is Sumi from Hashi Dental Care, the clinic''s AI receptionist. How can I help you?'),
    (1,'caller',9800,'ওয়ালাইকুম আসসালাম। আমার নিচের দাঁতে খুব ব্যথা, একটা appointment নিতে চাই, next Sunday evening এ হবে?','Walaikum assalam. My lower tooth hurts a lot, I want an appointment — is next Sunday evening possible?'),
    (2,'agent',16200,'ইশ্‌, দাঁতের ব্যথা খুব কষ্টের, বুঝতে পারছি। একটু দেখে নিই… রবিবার সন্ধ্যায় ডা. ফারহানা রহমানের সন্ধ্যা ৬টা আর সাড়ে ৬টা খালি আছে। কোনটা সুবিধা হবে?','Oh, toothache is really painful, I understand. Let me check… On Sunday evening Dr. Farhana Rahman has 6:00 and 6:30 free. Which suits you?'),
    (3,'caller',24500,'সাড়ে ছয়টা ভালো।','Six-thirty is good.'),
    (4,'agent',27300,'জি, আচ্ছা। আপনার পুরো নামটা একটু বলবেন?','Sure. Could you tell me your full name?'),
    (5,'caller',31000,'মোহাম্মদ রাকিবুল ইসলাম।','Mohammad Rakibul Islam.'),
    (6,'agent',34400,'আপনার নাম মোঃ রাকিবুল ইসলাম, ঠিক আছে? আর একটা মোবাইল নম্বর দেবেন?','Your name is Md. Rakibul Islam, correct? And could you give me a mobile number?'),
    (7,'caller',41800,'জি। জিরো ওয়ান এইট ওয়ান নাইন, চার পাঁচ ছয়, এক দুই তিন।','Yes. Zero one eight one nine, four five six, one two three.'),
    (8,'agent',50200,'মিলিয়ে নিচ্ছি — ০ ১ ৮ ১ ৯, ৪ ৫ ৬, ১ ২ ৩। ঠিক আছে?','Let me confirm — 0 1 8 1 9, 4 5 6, 1 2 3. Is that right?'),
    (9,'caller',56000,'হ্যাঁ, ঠিক আছে।','Yes, that''s right.'),
    (10,'agent',60100,'তাহলে মোঃ রাকিবুল ইসলাম, দাঁতের ব্যথার জন্য ডা. ফারহানা রহমান, রবিবার সন্ধ্যা সাড়ে ৬টা। সব ঠিক আছে? কনফার্ম করে দেব?','So: Md. Rakibul Islam, Dr. Farhana Rahman for the toothache, Sunday 6:30 pm. All correct? Shall I confirm it?'),
    (11,'caller',69400,'জি, করে দিন।','Yes, please do.'),
    (12,'agent',73800,'আপনার অ্যাপয়েন্টমেন্ট কনফার্ম হয়েছে, সিরিয়াল নম্বর ৪ ৮ ২ ১। দশ মিনিট আগে চলে আসবেন, আগের কোনো এক্স-রে থাকলে সাথে আনবেন।','Your appointment is confirmed, serial number 4821. Please come ten minutes early and bring any previous X-rays.'),
    (13,'caller',84000,'আচ্ছা, ব্যথার জন্য কোন ওষুধটা খাবো এখন?','OK — which medicine should I take for the pain now?'),
    (14,'agent',88600,'এ ব্যাপারে ডাক্তার দেখেই সঠিক বলতে পারবেন, আমি ওষুধের পরামর্শ দিতে পারি না। ব্যথা খুব বেড়ে গেলে বা মুখ ফুলে গেলে সাথে সাথে কাছের হাসপাতালে যাবেন।','Only the doctor can advise on that after examining you — I can''t recommend medicines. If the pain gets much worse or your face swells, please go to the nearest hospital straight away.'),
    (15,'caller',101000,'ঠিক আছে, ধন্যবাদ।','All right, thank you.'),
    (16,'agent',104500,'আপনাকেও ধন্যবাদ। রবিবার সন্ধ্যা সাড়ে ৬টায় দেখা হচ্ছে। ভালো থাকবেন, আল্লাহ হাফেজ।','Thank you too. See you Sunday at 6:30 pm. Take care, Allah Hafez.')
  ) as x(seq, sp, ms, bn, en);
  insert into public.call_extractions (call_id, intent, patient_name_bn, patient_name_en, phone_raw, phone_e164, phone_valid, reason_for_visit, service_code, doctor_id,
      preferred_text_raw, preferred_date, preferred_time, outcome, needs_human, confirmed_by_caller, notes, extracted_by, validation)
    values (c, 'book', 'মোঃ রাকিবুল ইসলাম', 'Md. Rakibul Islam', 'জিরো ওয়ান এইট ওয়ান নাইন, চার পাঁচ ছয়, এক দুই তিন', '+8801819456123', true, 'নিচের দাঁতে ব্যথা', 'consultation', d_farhana,
      'next Sunday evening', next_sun, '18:30', 'booked', false, true, 'Asked for pain medicine; declined and given emergency guidance.', 'seed-script',
      jsonb_build_object('patient_name', jsonb_build_object('present', true, 'bangla_script', true, 'source', 'tool'),
        'phone', jsonb_build_object('present', true, 'valid', true, 'normalized', '+8801819456123', 'operator', 'Banglalink', 'digits_heard', '01819456123', 'source', 'tool'),
        'preferred_date', jsonb_build_object('valid', true, 'clinic_open', true, 'source', 'appointment'),
        'preferred_time', jsonb_build_object('valid', true, 'within_hours', true, 'source', 'appointment'),
        'service_code', jsonb_build_object('valid', true, 'source', 'tool'), 'outcome_source', 'appointments_table'));
  insert into public.call_events (call_id, type, payload, result, ok, latency_ms, created_at) values
    (c, 'tool:check_availability', jsonb_build_object('date', next_sun, 'part_of_day', 'evening'), '{"ok":true,"slots":[{"time":"18:00"},{"time":"18:30"}]}', true, 182, t0 + interval '14 seconds'),
    (c, 'tool:save_caller_details', '{"patient_name_bn":"মোঃ রাকিবুল ইসলাম","phone":"01819456123"}', '{"ok":true,"readback":"০ ১ ৮ ১ ৯, ৪ ৫ ৬, ১ ২ ৩"}', true, 141, t0 + interval '58 seconds'),
    (c, 'tool:book_appointment', jsonb_build_object('date', next_sun, 'time', '18:30', 'confirmed_by_caller', true), '{"ok":true,"serial":"4821"}', true, 236, t0 + interval '71 seconds'),
    (c, 'finalize', '{"endReason":"agent_ended"}', '{"status":"booked"}', true, null, t0 + interval '3 minutes');

  ------------------------------------------------------------------
  -- 2. Enquiry only: Friday hours + location
  ------------------------------------------------------------------
  t0 := now() - interval '20 hours';
  insert into public.calls (clinic_id, started_at, connected_at, ended_at, status, end_reason, model, session_secret_hash, finalized_at, summary_bn, summary_en)
    values (v_clinic, t0, t0 + interval '1 second', t0 + interval '1 minute 12 seconds', 'enquiry', 'caller_hangup', 'seed-script', 'seed', t0 + interval '80 seconds',
      'কলার শুক্রবার খোলা কি না আর ক্লিনিকের ঠিকানা জানতে চেয়েছেন; বুকিং করেননি।',
      'Caller asked whether the clinic opens on Friday and for directions. No booking made.')
    returning id into c;
  insert into public.transcript_turns (call_id, seq, speaker, text_bn, text_en, offset_ms, ts) select c, x.seq, x.sp, x.bn, x.en, x.ms, t0 + x.ms * interval '1 millisecond' from (values
    (0,'agent',1900,'আসসালামু আলাইকুম, হাসি ডেন্টাল কেয়ার থেকে সুমি বলছি। বলুন, কীভাবে সাহায্য করতে পারি?','Assalamu alaikum, Sumi from Hashi Dental Care. How can I help?'),
    (1,'caller',7400,'আপনাদের চেম্বার কোথায়? আর শুক্রবার কি খোলা থাকে?','Where is your chamber? And are you open on Friday?'),
    (2,'agent',12100,'আমরা ধানমন্ডি, বাড়ি ২৭, রোড ৭/এ — ২৭ নম্বর মোড় থেকে সাত মসজিদ রোডের দিকে দুই মিনিট হাঁটলে, দোতলায়। শুক্রবার বন্ধ থাকে, শনিবার থেকে বৃহস্পতিবার সকাল ১০টা থেকে রাত ৯টা পর্যন্ত খোলা।','We''re at House 27, Road 7/A, Dhanmondi — two minutes'' walk from the 27 junction towards Satmasjid Road, on the first floor. We''re closed on Friday and open Saturday to Thursday, 10 am to 9 pm.'),
    (3,'caller',29800,'আচ্ছা, পার্কিং আছে?','OK, is there parking?'),
    (4,'agent',33200,'জি, বিল্ডিংয়ের নিচে গাড়ি রাখার জায়গা আছে। আর কিছু জানতে চান, বা একটা অ্যাপয়েন্টমেন্ট দেখে দেব?','Yes, there''s parking under the building. Anything else, or shall I find you an appointment?'),
    (5,'caller',42000,'না, পরে ফোন দেবো। ধন্যবাদ।','No, I''ll call later. Thanks.'),
    (6,'agent',45500,'ঠিক আছে, যেকোনো সময় ফোন দেবেন। ভালো থাকবেন।','Of course, call anytime. Take care.')
  ) as x(seq, sp, ms, bn, en);
  insert into public.call_extractions (call_id, intent, outcome, needs_human, confirmed_by_caller, reason_for_visit, extracted_by, validation)
    values (c, 'enquiry', 'enquiry', false, false, 'চেম্বারের ঠিকানা ও শুক্রবারের সময়', 'seed-script', '{"outcome_source":"llm","phone":{"present":false}}');

  ------------------------------------------------------------------
  -- 3. Follow-up: medical question + human requested (urgent swelling)
  ------------------------------------------------------------------
  t0 := now() - interval '9 hours';
  insert into public.patients (clinic_id, full_name_bn, full_name_en, phone_e164)
    values (v_clinic, 'শাহানা পারভীন', 'Shahana Parvin', '+8801711987654') returning id into p;
  insert into public.calls (clinic_id, patient_id, started_at, connected_at, ended_at, status, end_reason, model, session_secret_hash, finalized_at, summary_bn, summary_en)
    values (v_clinic, p, t0, t0 + interval '1 second', t0 + interval '1 minute 55 seconds', 'follow_up', 'agent_ended', 'seed-script', 'seed', t0 + interval '2 minutes',
      'শাহানা পারভীন দাঁত তোলার পর মাড়ি ফোলা নিয়ে ডাক্তারের সাথে কথা বলতে চেয়েছেন; জরুরি কলব্যাক দেওয়া হয়েছে।',
      'Shahana Parvin reported gum swelling after an extraction and asked to speak to a doctor. Agent gave emergency guidance and logged an urgent callback.')
    returning id into c;
  insert into public.transcript_turns (call_id, seq, speaker, text_bn, text_en, offset_ms, ts) select c, x.seq, x.sp, x.bn, x.en, x.ms, t0 + x.ms * interval '1 millisecond' from (values
    (0,'agent',2000,'আসসালামু আলাইকুম, হাসি ডেন্টাল কেয়ার থেকে সুমি বলছি। বলুন, কীভাবে সাহায্য করতে পারি?','Assalamu alaikum, Sumi from Hashi Dental Care. How can I help?'),
    (1,'caller',6900,'গত সপ্তাহে আপনাদের এখানে দাঁত তুলেছি, এখন মাড়িটা ফুলে গেছে। কোন antibiotic খাবো?','I had a tooth taken out at your clinic last week and now the gum is swollen. Which antibiotic should I take?'),
    (2,'agent',14800,'আপনার কষ্ট হচ্ছে বুঝতে পারছি। ওষুধের ব্যাপারে ডাক্তারই ঠিক বলতে পারবেন, আমি পরামর্শ দিতে পারি না। জ্বর আছে, বা ঢোক গিলতে বা শ্বাস নিতে কষ্ট হচ্ছে?','I understand you''re uncomfortable. Only the doctor can advise on medicine, I can''t. Do you have a fever, or any trouble swallowing or breathing?'),
    (3,'caller',26300,'হালকা জ্বর আছে।','A slight fever.'),
    (4,'agent',29900,'তাহলে দেরি না করে আজই কাছের হাসপাতালের ইমার্জেন্সিতে দেখিয়ে নিন, দরকার হলে ৯৯৯-এ ফোন করবেন। আমি এখনই ডাক্তারকে জরুরি ভিত্তিতে আপনাকে ফোন করতে বলছি। আপনার নাম আর নম্বরটা বলবেন?','Then please don''t wait — get checked at the nearest hospital emergency today, and call 999 if needed. I''m asking the doctor to call you back urgently right now. Could I have your name and number?'),
    (5,'caller',47000,'শাহানা পারভীন, ০১৭১১ ৯৮৭ ৬৫৪।','Shahana Parvin, 01711 987 654.'),
    (6,'agent',55100,'শাহানা পারভীন, নম্বর ০ ১ ৭ ১ ১, ৯ ৮ ৭, ৬ ৫ ৪ — ঠিক আছে?','Shahana Parvin, number 0 1 7 1 1, 9 8 7, 6 5 4 — correct?'),
    (7,'caller',62000,'জি।','Yes.'),
    (8,'agent',64800,'ধন্যবাদ। ডাক্তার খুব শিগগিরই আপনাকে ফোন করবেন। নিজের খেয়াল রাখবেন, আল্লাহ হাফেজ।','Thank you. The doctor will call you very soon. Please take care, Allah Hafez.')
  ) as x(seq, sp, ms, bn, en);
  insert into public.callbacks (clinic_id, call_id, patient_id, phone_e164, reason, category, priority, created_at)
    values (v_clinic, c, p, '+8801711987654', 'দাঁত তোলার পর মাড়ি ফোলা ও হালকা জ্বর; ওষুধ নিয়ে ডাক্তারের সাথে কথা বলতে চান।', 'medical_question', 'urgent', t0 + interval '70 seconds');
  insert into public.call_extractions (call_id, intent, patient_name_bn, patient_name_en, phone_raw, phone_e164, phone_valid, reason_for_visit, service_code, outcome, needs_human, confirmed_by_caller, notes, extracted_by, validation)
    values (c, 'callback', 'শাহানা পারভীন', 'Shahana Parvin', '০১৭১১ ৯৮৭ ৬৫৪', '+8801711987654', true, 'দাঁত তোলার পর মাড়ি ফোলা', 'extraction', 'follow_up', true, true,
      'Post-extraction swelling with mild fever. Advised emergency care; urgent doctor callback.', 'seed-script',
      '{"patient_name":{"present":true,"bangla_script":true,"source":"tool"},"phone":{"present":true,"valid":true,"normalized":"+8801711987654","operator":"Grameenphone","digits_heard":"01711987654","source":"tool"},"outcome_source":"callbacks_table"}');
  insert into public.call_events (call_id, type, payload, result, ok, latency_ms, created_at) values
    (c, 'tool:request_callback', '{"category":"medical_question","priority":"urgent"}', '{"ok":true,"priority":"urgent"}', true, 120, t0 + interval '70 seconds');

  ------------------------------------------------------------------
  -- 4a + 4b. Booked braces consult, later rescheduled on a second call
  ------------------------------------------------------------------
  t0 := now() - interval '3 days';
  insert into public.patients (clinic_id, full_name_bn, full_name_en, phone_e164)
    values (v_clinic, 'নাফিসা তাবাসসুম', 'Nafisa Tabassum', '+8801556321789') returning id into p;
  insert into public.calls (clinic_id, patient_id, started_at, connected_at, ended_at, status, end_reason, model, session_secret_hash, finalized_at, summary_bn, summary_en)
    values (v_clinic, p, t0, t0 + interval '1 second', t0 + interval '2 minutes 5 seconds', 'booked', 'agent_ended', 'seed-script', 'seed', t0 + interval '130 seconds',
      'নাফিসা তাবাসসুম মেয়ের ব্রেসেসের জন্য ডা. তানভীর আহমেদের কাছে সোমবার বিকাল ৫টায় সিরিয়াল নিয়েছেন।',
      'Nafisa Tabassum booked a braces consultation for her daughter with Dr. Tanvir Ahmed, Monday 5:00 pm.')
    returning id into c;
  insert into public.appointments (clinic_id, patient_id, doctor_id, service_id, call_id, updated_by_call_id, slot_start, slot_end, status, reason, ref_code)
    values (v_clinic, p, d_tanvir, s_braces, c, c, (next_mon + time '17:00') at time zone 'Asia/Dhaka', (next_mon + time '17:30') at time zone 'Asia/Dhaka', 'booked', 'মেয়ের দাঁত আঁকাবাঁকা, ব্রেসেস', '7360')
    returning id into a;
  insert into public.transcript_turns (call_id, seq, speaker, text_bn, text_en, offset_ms, ts) select c, x.seq, x.sp, x.bn, x.en, x.ms, t0 + x.ms * interval '1 millisecond' from (values
    (0,'agent',2000,'আসসালামু আলাইকুম, হাসি ডেন্টাল কেয়ার থেকে সুমি বলছি। বলুন?','Assalamu alaikum, Sumi from Hashi Dental Care. Go ahead?'),
    (1,'caller',6100,'আমার মেয়ের দাঁত একটু আঁকাবাঁকা, braces এর জন্য সিরিয়াল দিতে চাই।','My daughter''s teeth are a bit crooked, I want a serial for braces.'),
    (2,'agent',11800,'জি অবশ্যই, বাবুর জন্য ভালো সিদ্ধান্ত। আমাদের অর্থোডন্টিস্ট ডা. তানভীর আহমেদ শনি, সোম আর বুধবার বিকাল ৫টা থেকে বসেন। কোন দিন সুবিধা?','Of course — a good decision for her. Our orthodontist Dr. Tanvir Ahmed sits Saturday, Monday and Wednesday from 5 pm. Which day suits you?'),
    (3,'caller',22400,'সোমবার বিকাল পাঁচটা।','Monday, 5 pm.'),
    (4,'agent',25000,'সোমবার বিকাল ৫টা খালি আছে। আপনার নাম আর নম্বরটা বলবেন?','Monday 5 pm is free. Your name and number, please?'),
    (5,'caller',30100,'নাফিসা তাবাসসুম, শূন্য এক পাঁচ পাঁচ ছয়, তিন দুই এক, সাত আট নয়।','Nafisa Tabassum, zero one five five six, three two one, seven eight nine.'),
    (6,'agent',39800,'নাফিসা তাবাসসুম, ০ ১ ৫ ৫ ৬, ৩ ২ ১, ৭ ৮ ৯। ডা. তানভীর আহমেদ, সোমবার বিকাল ৫টা, ব্রেসেস কনসালটেশন। কনফার্ম করে দেব?','Nafisa Tabassum, 0 1 5 5 6, 3 2 1, 7 8 9. Dr. Tanvir Ahmed, Monday 5 pm, braces consultation. Shall I confirm?'),
    (7,'caller',51000,'জি দিন।','Yes, go ahead.'),
    (8,'agent',53900,'হয়ে গেছে, সিরিয়াল ৭ ৩ ৬ ০। মেয়েকে নিয়ে দশ মিনিট আগে আসবেন। ধন্যবাদ, ভালো থাকবেন।','Done — serial 7360. Please come ten minutes early with her. Thank you, take care.')
  ) as x(seq, sp, ms, bn, en);
  insert into public.call_extractions (call_id, intent, patient_name_bn, patient_name_en, phone_raw, phone_e164, phone_valid, reason_for_visit, service_code, doctor_id, preferred_text_raw, preferred_date, preferred_time, outcome, needs_human, confirmed_by_caller, notes, extracted_by, validation)
    values (c, 'book', 'নাফিসা তাবাসসুম', 'Nafisa Tabassum', 'শূন্য এক পাঁচ পাঁচ ছয়, তিন দুই এক, সাত আট নয়', '+8801556321789', true, 'মেয়ের দাঁত আঁকাবাঁকা, ব্রেসেস', 'braces', d_tanvir, 'সোমবার বিকাল পাঁচটা', next_mon, '17:00', 'booked', false, true, 'Appointment is for the caller''s daughter.', 'seed-script',
      '{"patient_name":{"present":true,"bangla_script":true,"source":"tool"},"phone":{"present":true,"valid":true,"normalized":"+8801556321789","operator":"Teletalk","digits_heard":"01556321789","source":"tool"},"preferred_date":{"valid":true,"clinic_open":true,"source":"appointment"},"preferred_time":{"valid":true,"within_hours":true,"source":"appointment"},"service_code":{"valid":true,"source":"tool"},"outcome_source":"appointments_table"}');

  t0 := now() - interval '5 hours';
  insert into public.calls (clinic_id, patient_id, started_at, connected_at, ended_at, status, end_reason, model, session_secret_hash, finalized_at, summary_bn, summary_en)
    values (v_clinic, p, t0, t0 + interval '1 second', t0 + interval '1 minute 40 seconds', 'rescheduled', 'agent_ended', 'seed-script', 'seed', t0 + interval '105 seconds',
      'নাফিসা তাবাসসুম মেয়ের ব্রেসেস কনসালটেশন সোমবার থেকে বুধবার সন্ধ্যা ৬টায় সরিয়েছেন।',
      'Nafisa Tabassum moved her daughter''s braces consultation from Monday to Wednesday 6:00 pm (same serial).')
    returning id into c;
  update public.appointments set slot_start = (next_wed + time '18:00') at time zone 'Asia/Dhaka', slot_end = (next_wed + time '18:30') at time zone 'Asia/Dhaka',
    status = 'rescheduled', updated_by_call_id = c where id = a;
  insert into public.transcript_turns (call_id, seq, speaker, text_bn, text_en, offset_ms, ts) select c, x.seq, x.sp, x.bn, x.en, x.ms, t0 + x.ms * interval '1 millisecond' from (values
    (0,'agent',1900,'আসসালামু আলাইকুম, হাসি ডেন্টাল কেয়ার থেকে সুমি বলছি। বলুন?','Assalamu alaikum, Sumi from Hashi Dental Care. Go ahead?'),
    (1,'caller',5600,'আমার appointment টা reschedule করতে চাই, সোমবার মেয়ের স্কুলে exam।','I want to reschedule my appointment — my daughter has an exam at school on Monday.'),
    (2,'agent',11900,'জি, কোনো সমস্যা নেই। যে নম্বর দিয়ে বুক করেছিলেন সেটা বলবেন?','Sure, no problem. Which number did you book with?'),
    (3,'caller',16800,'০১৫৫৬ ৩২১ ৭৮৯।','01556 321 789.'),
    (4,'agent',21400,'পেয়েছি — নাফিসা তাবাসসুম, ডা. তানভীর আহমেদ, সোমবার বিকাল ৫টা। কবে সরাতে চান?','Found it — Nafisa Tabassum, Dr. Tanvir Ahmed, Monday 5 pm. When would you like to move it to?'),
    (5,'caller',29000,'বুধবার সন্ধ্যার দিকে হবে?','Is Wednesday evening possible?'),
    (6,'agent',32700,'বুধবার সন্ধ্যা ৬টা আর সাড়ে ৬টা খালি আছে।','Wednesday has 6:00 and 6:30 pm free.'),
    (7,'caller',38000,'ছয়টা।','Six.'),
    (8,'agent',40300,'তাহলে বুধবার সন্ধ্যা ৬টা, ডা. তানভীর আহমেদ — সরিয়ে দেব?','So Wednesday 6 pm with Dr. Tanvir Ahmed — shall I move it?'),
    (9,'caller',45200,'হ্যাঁ।','Yes.'),
    (10,'agent',47600,'হয়ে গেছে, সিরিয়াল একই থাকছে — ৭ ৩ ৬ ০। মেয়ের পরীক্ষার জন্য শুভকামনা! আল্লাহ হাফেজ।','Done, the serial stays the same — 7360. Best of luck to your daughter with her exam! Allah Hafez.')
  ) as x(seq, sp, ms, bn, en);
  insert into public.call_extractions (call_id, intent, patient_name_bn, patient_name_en, phone_raw, phone_e164, phone_valid, reason_for_visit, service_code, doctor_id, preferred_text_raw, preferred_date, preferred_time, outcome, needs_human, confirmed_by_caller, extracted_by, validation)
    values (c, 'reschedule', 'নাফিসা তাবাসসুম', 'Nafisa Tabassum', '০১৫৫৬ ৩২১ ৭৮৯', '+8801556321789', true, 'মেয়ের পরীক্ষা, সময় বদল', 'braces', d_tanvir, 'বুধবার সন্ধ্যার দিকে', next_wed, '18:00', 'rescheduled', false, true, 'seed-script',
      '{"patient_name":{"present":true,"bangla_script":true,"source":"tool"},"phone":{"present":true,"valid":true,"normalized":"+8801556321789","operator":"Teletalk","digits_heard":"01556321789","source":"tool"},"preferred_date":{"valid":true,"clinic_open":true,"source":"appointment"},"preferred_time":{"valid":true,"within_hours":true,"source":"appointment"},"outcome_source":"appointments_table"}');

  ------------------------------------------------------------------
  -- 5. Off-topic attempt politely declined, then scaling booked
  ------------------------------------------------------------------
  t0 := now() - interval '2 hours';
  insert into public.patients (clinic_id, full_name_bn, full_name_en, phone_e164)
    values (v_clinic, 'তানভীর হাসান', 'Tanvir Hasan', '+8801912003344') returning id into p;
  insert into public.calls (clinic_id, patient_id, started_at, connected_at, ended_at, status, end_reason, model, session_secret_hash, finalized_at, summary_bn, summary_en)
    values (v_clinic, p, t0, t0 + interval '1 second', t0 + interval '2 minutes 20 seconds', 'booked', 'agent_ended', 'seed-script', 'seed', t0 + interval '145 seconds',
      'তানভীর হাসান প্রথমে খেলার খবর জানতে চাইলে সুমি ভদ্রভাবে ফিরিয়ে আনে; পরে শনিবার সকাল ১১টায় স্কেলিং বুক করেছেন।',
      'Caller first asked about a cricket score; the agent politely declined and steered back. He then booked scaling for Saturday 11:00 am.')
    returning id into c;
  insert into public.appointments (clinic_id, patient_id, doctor_id, service_id, call_id, updated_by_call_id, slot_start, slot_end, status, reason, ref_code)
    values (v_clinic, p, d_farhana, s_scaling, c, c, (next_sat + time '11:00') at time zone 'Asia/Dhaka', (next_sat + time '11:30') at time zone 'Asia/Dhaka', 'booked', 'দাঁত পরিষ্কার', '2195');
  insert into public.transcript_turns (call_id, seq, speaker, text_bn, text_en, offset_ms, ts) select c, x.seq, x.sp, x.bn, x.en, x.ms, t0 + x.ms * interval '1 millisecond' from (values
    (0,'agent',2000,'আসসালামু আলাইকুম, হাসি ডেন্টাল কেয়ার থেকে সুমি বলছি। বলুন, কীভাবে সাহায্য করতে পারি?','Assalamu alaikum, Sumi from Hashi Dental Care. How can I help?'),
    (1,'caller',6400,'আচ্ছা আজকে বাংলাদেশের খেলার স্কোর কত জানেন?','By the way, do you know today''s Bangladesh match score?'),
    (2,'agent',10200,'দুঃখিত, আমি শুধু হাসি ডেন্টাল কেয়ারের অ্যাপয়েন্টমেন্ট আর ক্লিনিকের তথ্য নিয়ে সাহায্য করতে পারি। আপনার কি কোনো অ্যাপয়েন্টমেন্ট লাগবে?','Sorry, I can only help with Hashi Dental Care appointments and clinic information. Do you need an appointment?'),
    (3,'caller',17900,'হা হা, ঠিক আছে। scaling করাতে চাই, শনিবার সকালে।','Ha ha, OK. I want scaling, Saturday morning.'),
    (4,'agent',22600,'জি অবশ্যই। শনিবার সকালে ডা. ফারহানা রহমানের সকাল ১১টা আর সাড়ে ১১টা খালি আছে। কোনটা নেবেন?','Of course. On Saturday morning Dr. Farhana Rahman has 11:00 and 11:30 free. Which would you like?'),
    (5,'caller',30800,'এগারোটা।','Eleven.'),
    (6,'agent',33100,'আপনার পুরো নাম আর মোবাইল নম্বরটা বলবেন?','Your full name and mobile number, please?'),
    (7,'caller',37500,'তানভীর হাসান, জিরো ওয়ান নাইন ওয়ান টু, ডাবল জিরো থ্রি, থ্রি ফোর ফোর।','Tanvir Hasan, zero one nine one two, double zero three, three four four.'),
    (8,'agent',47700,'তানভীর হাসান, ০ ১ ৯ ১ ২, ০ ০ ৩, ৩ ৪ ৪ — ঠিক আছে?','Tanvir Hasan, 0 1 9 1 2, 0 0 3, 3 4 4 — correct?'),
    (9,'caller',55200,'একদম ঠিক।','Exactly right.'),
    (10,'agent',57400,'স্কেলিং, ডা. ফারহানা রহমান, শনিবার সকাল ১১টা। ফি ১,৫০০ থেকে ২,৫০০ টাকা, ডাক্তার দেখে ঠিক করবেন। কনফার্ম করে দেব?','Scaling with Dr. Farhana Rahman, Saturday 11 am. The fee is 1,500–2,500 taka, confirmed by the doctor. Shall I confirm?'),
    (11,'caller',68000,'জি।','Yes.'),
    (12,'agent',70300,'কনফার্ম হয়েছে, সিরিয়াল ২ ১ ৯ ৫। স্বাভাবিকভাবে খেয়ে আসতে পারেন। ধন্যবাদ, ভালো থাকবেন।','Confirmed, serial 2195. You can eat normally before coming. Thank you, take care.')
  ) as x(seq, sp, ms, bn, en);
  insert into public.call_extractions (call_id, intent, patient_name_bn, patient_name_en, phone_raw, phone_e164, phone_valid, reason_for_visit, service_code, doctor_id, preferred_text_raw, preferred_date, preferred_time, outcome, needs_human, confirmed_by_caller, notes, extracted_by, validation)
    values (c, 'book', 'তানভীর হাসান', 'Tanvir Hasan', 'জিরো ওয়ান নাইন ওয়ান টু, ডাবল জিরো থ্রি, থ্রি ফোর ফোর', '+8801912003344', true, 'দাঁত পরিষ্কার', 'scaling', d_farhana, 'শনিবার সকালে', next_sat, '11:00', 'booked', false, true, 'Off-topic question (cricket score) declined.', 'seed-script',
      '{"patient_name":{"present":true,"bangla_script":true,"source":"tool"},"phone":{"present":true,"valid":true,"normalized":"+8801912003344","operator":"Banglalink","digits_heard":"01912003344","source":"tool"},"preferred_date":{"valid":true,"clinic_open":true,"source":"appointment"},"preferred_time":{"valid":true,"within_hours":true,"source":"appointment"},"service_code":{"valid":true,"source":"tool"},"outcome_source":"appointments_table"}');

  ------------------------------------------------------------------
  -- 6. Incomplete: caller hung up mid-way, invalid number caught
  ------------------------------------------------------------------
  t0 := now() - interval '70 minutes';
  insert into public.calls (clinic_id, started_at, connected_at, ended_at, status, end_reason, model, session_secret_hash, finalized_at, summary_bn, summary_en)
    values (v_clinic, t0, t0 + interval '1 second', t0 + interval '48 seconds', 'incomplete', 'caller_hangup', 'seed-script', 'seed', t0 + interval '52 seconds',
      'কলার নাম বলার পর নম্বর অসম্পূর্ণ দিয়ে কল কেটে দিয়েছেন।',
      'Caller gave a name, then an incomplete number (10 digits) and hung up before re-confirming.')
    returning id into c;
  insert into public.transcript_turns (call_id, seq, speaker, text_bn, text_en, offset_ms, ts) select c, x.seq, x.sp, x.bn, x.en, x.ms, t0 + x.ms * interval '1 millisecond' from (values
    (0,'agent',2000,'আসসালামু আলাইকুম, হাসি ডেন্টাল কেয়ার থেকে সুমি বলছি। বলুন?','Assalamu alaikum, Sumi from Hashi Dental Care. Go ahead?'),
    (1,'caller',5800,'একটা চেকআপ করাতে চাই। আমার নাম মরিয়ম বেগম।','I''d like a check-up. My name is Moriom Begum.'),
    (2,'agent',11200,'জি, মরিয়ম বেগম। একটা মোবাইল নম্বর দেবেন?','Sure, Moriom Begum. Could you give me a mobile number?'),
    (3,'caller',16000,'০১৬৭৪ ৫৫০ ০১।','01674 550 01.'),
    (4,'agent',22300,'নম্বরটা মনে হয় পুরো আসেনি — ০১ দিয়ে শুরু ১১ ডিজিটের নম্বরটা আরেকবার বলবেন?','I think the number didn''t come through fully — could you say the 11-digit number starting with 01 again?')
  ) as x(seq, sp, ms, bn, en);
  insert into public.call_extractions (call_id, intent, patient_name_bn, patient_name_en, phone_raw, phone_e164, phone_valid, reason_for_visit, service_code, outcome, needs_human, confirmed_by_caller, notes, extracted_by, validation)
    values (c, 'book', 'মরিয়ম বেগম', 'Moriom Begum', '০১৬৭৪ ৫৫০ ০১', null, false, 'চেকআপ', 'consultation', 'incomplete', false, false, 'Hung up after the agent asked to repeat the number. Worth a courtesy call if a number is found.', 'seed-script',
      '{"patient_name":{"present":true,"bangla_script":true,"source":"tool"},"phone":{"present":true,"valid":false,"problem":"too_short","digits_heard":"0167455001","source":"llm"},"outcome_source":"rules"}');
  insert into public.call_events (call_id, type, payload, result, ok, latency_ms, created_at) values
    (c, 'tool:save_caller_details', '{"patient_name_bn":"মরিয়ম বেগম","phone":"০১৬৭৪ ৫৫০ ০১"}', '{"ok":false,"error":"invalid_phone","problem":"too_short","heard_digits":"0167455001"}', false, 97, t0 + interval '20 seconds');

  ------------------------------------------------------------------
  -- 7. Failed: connection dropped right after greeting
  ------------------------------------------------------------------
  t0 := now() - interval '40 minutes';
  insert into public.calls (clinic_id, started_at, connected_at, ended_at, status, end_reason, model, session_secret_hash, finalized_at, error_detail, summary_en)
    values (v_clinic, t0, null, t0 + interval '9 seconds', 'failed', 'error', 'seed-script', 'seed', t0 + interval '11 seconds', '1006 network connection lost',
      'Connection dropped before the caller spoke. No data captured.')
    returning id into c;
  insert into public.call_extractions (call_id, outcome, needs_human, confirmed_by_caller, extracted_by, validation)
    values (c, 'failed', false, false, 'rules', '{"outcome_source":"rules","phone":{"present":false}}');
end $$;
