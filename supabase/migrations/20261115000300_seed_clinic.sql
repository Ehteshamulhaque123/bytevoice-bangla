-- Demo clinic (fictional). Weekday: 0=Sun … 5=Fri (closed) … 6=Sat.
revoke all on public.call_overview from anon;

insert into public.clinics (slug, name_bn, name_en, phone, address_bn, address_en, directions_bn, slot_minutes)
values ('hashi-dental', 'হাসি ডেন্টাল কেয়ার', 'Hashi Dental Care', '+8809610000000',
        'বাড়ি ২৭, রোড ৭/এ, ধানমন্ডি, ঢাকা ১২০৯',
        'House 27, Road 7/A, Dhanmondi, Dhaka 1209',
        'ধানমন্ডি ২৭ নম্বর মোড় থেকে সাত মসজিদ রোডের দিকে দুই মিনিট হাঁটলে, স্টার কাবাবের উল্টো পাশের গলিতে দোতলায়। গাড়ি রাখার জায়গা বিল্ডিংয়ের নিচে আছে।',
        30);

with c as (select id from public.clinics where slug = 'hashi-dental')
insert into public.doctors (clinic_id, full_name_bn, full_name_en, title_bn, title_en)
select c.id, v.bn, v.en, v.tbn, v.ten from c, (values
  ('ডা. ফারহানা রহমান', 'Dr. Farhana Rahman', 'জেনারেল ডেন্টিস্ট', 'General dentist'),
  ('ডা. তানভীর আহমেদ', 'Dr. Tanvir Ahmed', 'অর্থোডন্টিস্ট (ব্রেসেস)', 'Orthodontist'),
  ('ডা. নুসরাত জাহান', 'Dr. Nusrat Jahan', 'ওরাল সার্জন ও রুট ক্যানাল', 'Oral surgeon & endodontist')
) as v(bn, en, tbn, ten);

-- Typical Dhaka chamber hours: morning and evening sessions, Friday closed.
insert into public.doctor_schedules (doctor_id, weekday, start_time, end_time)
select d.id, w.wd, s.st::time, s.et::time
from public.doctors d
cross join (values (0),(1),(2),(3),(4),(6)) as w(wd)
cross join lateral (
  select * from (values
    ('Dr. Farhana Rahman', '10:00', '13:30'), ('Dr. Farhana Rahman', '16:00', '21:00'),
    ('Dr. Tanvir Ahmed',   '17:00', '21:00'),
    ('Dr. Nusrat Jahan',   '10:00', '14:00'), ('Dr. Nusrat Jahan',   '18:00', '21:00')
  ) as x(name, st, et) where x.name = d.full_name_en
) s
-- Dr. Tanvir only Sat, Mon, Wed; Dr. Nusrat not on Tuesday.
where not (d.full_name_en = 'Dr. Tanvir Ahmed' and w.wd not in (6,1,3))
  and not (d.full_name_en = 'Dr. Nusrat Jahan' and w.wd = 2);

with c as (select id from public.clinics where slug = 'hashi-dental')
insert into public.services (clinic_id, code, name_bn, name_en, fee_from_bdt, fee_to_bdt, duration_min, prep_bn)
select c.id, v.* from c, (values
  ('consultation', 'ডাক্তার দেখানো (কনসালটেশন)', 'Consultation / check-up', 500, null::int, 30, 'আগের কোনো এক্স-রে বা প্রেসক্রিপশন থাকলে সাথে আনবেন।'),
  ('scaling', 'স্কেলিং ও পলিশিং (দাঁত পরিষ্কার)', 'Scaling & polishing', 1500, 2500, 30, 'আসার আগে স্বাভাবিকভাবে খেয়ে আসতে পারেন।'),
  ('filling', 'ফিলিং', 'Filling', 1500, 3500, 30, null),
  ('root_canal', 'রুট ক্যানাল', 'Root canal treatment', 8000, 15000, 60, 'প্রথমে ডাক্তার দেখে এক্স-রে করবেন, তারপর খরচ নিশ্চিত হবে।'),
  ('extraction', 'দাঁত তোলা', 'Tooth extraction', 1000, 5000, 30, 'হালকা খাবার খেয়ে আসবেন। রক্ত পাতলা করার ওষুধ খেলে ডাক্তারকে জানাবেন।'),
  ('braces', 'ব্রেসেস কনসালটেশন', 'Braces consultation', 1000, null, 30, null),
  ('whitening', 'দাঁত সাদা করা (হোয়াইটেনিং)', 'Teeth whitening', 8000, 12000, 60, null),
  ('child_dental', 'শিশুদের দাঁতের চিকিৎসা', 'Children''s dentistry', 500, null, 30, 'অভিভাবক সাথে থাকবেন।')
) as v(code, name_bn, name_en, fee_from, fee_to, dur, prep);
