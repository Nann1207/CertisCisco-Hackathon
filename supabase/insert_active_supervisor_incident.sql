-- Run this in the Supabase SQL editor.
-- Inserts a new active incident for the supervisor whose own shift is active now.
-- The incident_id is generated once and reused for the CCTV frame paths.

with active_supervisor_shift as (
  select
    s.shift_id,
    s.officer_id as supervisor_id
  from public.shifts s
  where s.officer_id is not null
    and now() between s.shift_start and s.shift_end
  order by s.shift_start desc
  limit 1
),
new_incident as (
  select gen_random_uuid() as incident_id
)
insert into public.incidents (
  incident_id,
  incident_name,
  incident_category,
  location_name,
  location_unit_no,
  location_description,
  latitude,
  longitude,
  prediction_correct,
  active_status,
  cctv_image_1_path,
  cctv_image_2_path,
  cctv_image_3_path,
  created_at,
  updated_at,
  cctv_camera_id,
  cctvid,
  shift_id,
  supervisor_id,
  predicted_threat,
  threat_detected,
  ai_assessment,
  threat_confidence,
  yolo_objects,
  cctv_image_4
)
select
  ni.incident_id,
  'Violence Threat at McDonald''s',
  'Violence',
  'McDonald''s',
  'NEX B2 - McDonald''s (#B2-05/06/07/08)',
  'Dining area',
  1.3509746488104,
  103.871898909771,
  true,
  true,
  'incidents/' || ni.incident_id || '/frame_1.jpg',
  'incidents/' || ni.incident_id || '/frame_2.jpg',
  'incidents/' || ni.incident_id || '/frame_3.jpg',
  now(),
  now(),
  '701125bd-c4f9-4982-bdc4-96e105725ae5',
  'cctv3',
  ass.shift_id,
  ass.supervisor_id,
  'fighting',
  true,
  '1) Situation Summary
Active physical altercation in McDonald''s dining area. Multiple individuals involved.

2) Key Observations
Two individuals actively fighting near tables. One wearing a light-colored shirt, the other a dark shirt. Several bystanders observing. Individuals moving towards the altercation. Possible escalation.

3) Immediate Actions
Proceed to McDonald''s dining area. Separate individuals involved. Restore order. Assess for injuries.

4) Follow-up Actions
Interview witnesses. Obtain statements. Review additional CCTV footage.

5) Officer Safety Notes
Be aware of potential secondary aggressors. Maintain situational awareness. Request backup if needed.

6) Dispatch Message
Units respond to McDonald''s dining area. Report active fight. Multiple individuals involved. Requesting immediate assistance. Camera cctv3.',
  null,
  '[{"conf": 0.9084994792938232, "frame": 495, "label": "chair"}, {"conf": 0.8888551592826843, "frame": 540, "label": "chair"}, {"conf": 0.8750675320625305, "frame": 450, "label": "person"}, {"conf": 0.8500012755393982, "frame": 45, "label": "chair"}, {"conf": 0.8435585498809814, "frame": 270, "label": "person"}, {"conf": 0.8221568465232849, "frame": 315, "label": "person"}, {"conf": 0.8162144422531128, "frame": 405, "label": "chair"}, {"conf": 0.8155649304389954, "frame": 180, "label": "person"}, {"conf": 0.812318742275238, "frame": 405, "label": "person"}, {"conf": 0.8119017481803894, "frame": 90, "label": "chair"}, {"conf": 0.8055747747421265, "frame": 450, "label": "chair"}, {"conf": 0.7869160175323486, "frame": 180, "label": "person"}]',
  'incidents/' || ni.incident_id || '/frame_4.jpg'
from new_incident ni
cross join active_supervisor_shift ass
returning incident_id, shift_id, supervisor_id, created_at, updated_at;
