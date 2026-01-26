-- Prospection Graph Schema
-- DuckPGQ extension for job prospection queries
--
-- Extends the student_graph with:
-- - Places (physical locations for jobs)
-- - Prospection categories
-- - Location nodes (geographic zones)
-- - Relations: skill → job → place, category → place_type, distance edges

-- ============================================
-- PROSPECTION NODES
-- ============================================

-- Places (physical locations where students can find work)
INSERT INTO student_nodes (id, domain, name, properties) VALUES
  -- Service & Hospitality
  ('place_restaurant_generic', 'place', 'Restaurant', '{"type": "restaurant", "category": "service", "avg_rate": 12, "effort_level": 4}'),
  ('place_cafe_generic', 'place', 'Café', '{"type": "cafe", "category": "service", "avg_rate": 11.65, "effort_level": 3}'),
  ('place_bar_generic', 'place', 'Bar', '{"type": "bar", "category": "service", "avg_rate": 13, "effort_level": 4}'),
  ('place_fastfood_generic', 'place', 'Fast-food', '{"type": "meal_takeaway", "category": "service", "avg_rate": 11.65, "effort_level": 4}'),

  -- Retail
  ('place_store_generic', 'place', 'Store', '{"type": "store", "category": "retail", "avg_rate": 11.65, "effort_level": 3}'),
  ('place_supermarket_generic', 'place', 'Supermarket', '{"type": "supermarket", "category": "retail", "avg_rate": 11.65, "effort_level": 3}'),
  ('place_mall_generic', 'place', 'Shopping Mall', '{"type": "shopping_mall", "category": "retail", "avg_rate": 12, "effort_level": 3}'),

  -- Cleaning & Maintenance
  ('place_hotel_generic', 'place', 'Hotel', '{"type": "lodging", "category": "cleaning", "avg_rate": 12, "effort_level": 4}'),
  ('place_gym_generic', 'place', 'Gym', '{"type": "gym", "category": "cleaning", "avg_rate": 11.65, "effort_level": 4}'),

  -- Education & Tutoring
  ('place_library_generic', 'place', 'Library', '{"type": "library", "category": "tutoring", "avg_rate": 18, "effort_level": 2}'),
  ('place_university_generic', 'place', 'University', '{"type": "university", "category": "campus", "avg_rate": 12, "effort_level": 2}'),
  ('place_school_generic', 'place', 'School', '{"type": "school", "category": "tutoring", "avg_rate": 20, "effort_level": 2}')
ON CONFLICT (id) DO NOTHING;

-- Prospection Categories
INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('cat_service', 'prospection_category', 'Service & Hospitality', '{"effort_level": 4, "avg_rate_min": 11, "avg_rate_max": 14, "google_types": ["restaurant", "cafe", "bar", "meal_takeaway"]}'),
  ('cat_retail', 'prospection_category', 'Retail & Sales', '{"effort_level": 3, "avg_rate_min": 11, "avg_rate_max": 13, "google_types": ["store", "supermarket", "shopping_mall"]}'),
  ('cat_cleaning', 'prospection_category', 'Cleaning & Maintenance', '{"effort_level": 4, "avg_rate_min": 11, "avg_rate_max": 15, "google_types": ["lodging", "gym"]}'),
  ('cat_tutoring', 'prospection_category', 'Tutoring & Lessons', '{"effort_level": 2, "avg_rate_min": 15, "avg_rate_max": 30, "google_types": ["library", "university", "school"]}'),
  ('cat_campus', 'prospection_category', 'Campus Jobs', '{"effort_level": 2, "avg_rate_min": 11, "avg_rate_max": 13, "google_types": ["university", "library"]}'),
  ('cat_digital', 'prospection_category', 'Digital & Remote', '{"effort_level": 2, "avg_rate_min": 12, "avg_rate_max": 25, "google_types": ["cafe", "library"]}'),
  ('cat_childcare', 'prospection_category', 'Childcare & Pet sitting', '{"effort_level": 2, "avg_rate_min": 10, "avg_rate_max": 15, "google_types": ["school"]}'),
  ('cat_events', 'prospection_category', 'Events & Promo', '{"effort_level": 3, "avg_rate_min": 12, "avg_rate_max": 18, "google_types": []}'),
  ('cat_interim', 'prospection_category', 'Temp Agencies', '{"effort_level": 4, "avg_rate_min": 11, "avg_rate_max": 14, "google_types": []}'),
  ('cat_handyman', 'prospection_category', 'Handyman & Moving', '{"effort_level": 5, "avg_rate_min": 12, "avg_rate_max": 20, "google_types": []}')
ON CONFLICT (id) DO NOTHING;

-- Job Types (specific to prospection)
INSERT INTO student_nodes (id, domain, name, properties) VALUES
  -- Service jobs
  ('job_waiter', 'job', 'Waiter/Waitress', '{"hourly_rate": 12, "category": "service", "effort_level": 4, "schedule_flexibility": 0.5}'),
  ('job_barista', 'job', 'Barista', '{"hourly_rate": 11.65, "category": "service", "effort_level": 3, "schedule_flexibility": 0.6}'),
  ('job_bartender', 'job', 'Bartender', '{"hourly_rate": 13, "category": "service", "effort_level": 4, "schedule_flexibility": 0.4}'),
  ('job_kitchen_helper', 'job', 'Kitchen Helper', '{"hourly_rate": 11.65, "category": "service", "effort_level": 5, "schedule_flexibility": 0.3}'),

  -- Retail jobs
  ('job_cashier', 'job', 'Cashier', '{"hourly_rate": 11.65, "category": "retail", "effort_level": 3, "schedule_flexibility": 0.4}'),
  ('job_sales_associate', 'job', 'Sales Associate', '{"hourly_rate": 11.65, "category": "retail", "effort_level": 3, "schedule_flexibility": 0.5}'),
  ('job_stock_clerk', 'job', 'Stock Clerk', '{"hourly_rate": 11.65, "category": "retail", "effort_level": 4, "schedule_flexibility": 0.6}'),

  -- Education jobs
  ('job_tutor', 'job', 'Private Tutor', '{"hourly_rate": 20, "category": "tutoring", "effort_level": 2, "schedule_flexibility": 0.9}'),
  ('job_library_assistant', 'job', 'Library Assistant', '{"hourly_rate": 11.65, "category": "campus", "effort_level": 2, "schedule_flexibility": 0.7}'),
  ('job_lab_monitor', 'job', 'Lab Monitor', '{"hourly_rate": 12, "category": "campus", "effort_level": 2, "schedule_flexibility": 0.6}'),

  -- Cleaning jobs
  ('job_housekeeper', 'job', 'Housekeeper', '{"hourly_rate": 12, "category": "cleaning", "effort_level": 4, "schedule_flexibility": 0.7}'),
  ('job_cleaner', 'job', 'Cleaner', '{"hourly_rate": 11.65, "category": "cleaning", "effort_level": 4, "schedule_flexibility": 0.8}'),

  -- Digital jobs
  ('job_social_media', 'job', 'Social Media Manager', '{"hourly_rate": 15, "category": "digital", "effort_level": 2, "schedule_flexibility": 0.95}'),
  ('job_data_entry_remote', 'job', 'Data Entry (Remote)', '{"hourly_rate": 12, "category": "digital", "effort_level": 2, "schedule_flexibility": 0.95}'),

  -- Childcare
  ('job_babysitter', 'job', 'Babysitter', '{"hourly_rate": 12, "category": "childcare", "effort_level": 2, "schedule_flexibility": 0.85}'),
  ('job_pet_sitter', 'job', 'Pet Sitter', '{"hourly_rate": 12, "category": "childcare", "effort_level": 2, "schedule_flexibility": 0.9}')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PROSPECTION EDGES
-- ============================================

-- Category → Place Type relations (category contains place types)
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('cat_service', 'place_restaurant_generic', 'contains', 1.0, '{"place_type": "restaurant"}'),
  ('cat_service', 'place_cafe_generic', 'contains', 1.0, '{"place_type": "cafe"}'),
  ('cat_service', 'place_bar_generic', 'contains', 1.0, '{"place_type": "bar"}'),
  ('cat_service', 'place_fastfood_generic', 'contains', 1.0, '{"place_type": "meal_takeaway"}'),

  ('cat_retail', 'place_store_generic', 'contains', 1.0, '{"place_type": "store"}'),
  ('cat_retail', 'place_supermarket_generic', 'contains', 1.0, '{"place_type": "supermarket"}'),
  ('cat_retail', 'place_mall_generic', 'contains', 1.0, '{"place_type": "shopping_mall"}'),

  ('cat_cleaning', 'place_hotel_generic', 'contains', 1.0, '{"place_type": "lodging"}'),
  ('cat_cleaning', 'place_gym_generic', 'contains', 1.0, '{"place_type": "gym"}'),

  ('cat_tutoring', 'place_library_generic', 'contains', 1.0, '{"place_type": "library"}'),
  ('cat_tutoring', 'place_school_generic', 'contains', 1.0, '{"place_type": "school"}'),
  ('cat_tutoring', 'place_university_generic', 'contains', 0.8, '{"place_type": "university"}'),

  ('cat_campus', 'place_university_generic', 'contains', 1.0, '{"place_type": "university"}'),
  ('cat_campus', 'place_library_generic', 'contains', 0.9, '{"place_type": "library"}'),

  ('cat_digital', 'place_cafe_generic', 'contains', 0.7, '{"place_type": "cafe", "reason": "coworking_friendly"}'),
  ('cat_digital', 'place_library_generic', 'contains', 0.8, '{"place_type": "library", "reason": "quiet_workspace"}')
ON CONFLICT DO NOTHING;

-- Job → Place relations (jobs available at place types)
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  -- Service jobs → Places
  ('job_waiter', 'place_restaurant_generic', 'available_at', 0.95, '{"typical_hours": "evenings_weekends"}'),
  ('job_barista', 'place_cafe_generic', 'available_at', 0.9, '{"typical_hours": "mornings_afternoons"}'),
  ('job_bartender', 'place_bar_generic', 'available_at', 0.9, '{"typical_hours": "evenings_nights"}'),
  ('job_kitchen_helper', 'place_restaurant_generic', 'available_at', 0.85, '{"typical_hours": "lunch_dinner"}'),
  ('job_kitchen_helper', 'place_fastfood_generic', 'available_at', 0.9, '{"typical_hours": "flexible"}'),

  -- Retail jobs → Places
  ('job_cashier', 'place_supermarket_generic', 'available_at', 0.95, '{"typical_hours": "all_day"}'),
  ('job_cashier', 'place_store_generic', 'available_at', 0.9, '{"typical_hours": "afternoons_weekends"}'),
  ('job_sales_associate', 'place_mall_generic', 'available_at', 0.9, '{"typical_hours": "afternoons_weekends"}'),
  ('job_sales_associate', 'place_store_generic', 'available_at', 0.85, '{"typical_hours": "afternoons_weekends"}'),
  ('job_stock_clerk', 'place_supermarket_generic', 'available_at', 0.85, '{"typical_hours": "early_morning_late_night"}'),

  -- Education jobs → Places
  ('job_tutor', 'place_library_generic', 'available_at', 0.8, '{"typical_hours": "afternoons_evenings"}'),
  ('job_tutor', 'place_school_generic', 'available_at', 0.7, '{"typical_hours": "after_school"}'),
  ('job_library_assistant', 'place_library_generic', 'available_at', 0.95, '{"typical_hours": "all_day"}'),
  ('job_library_assistant', 'place_university_generic', 'available_at', 0.9, '{"typical_hours": "all_day"}'),
  ('job_lab_monitor', 'place_university_generic', 'available_at', 0.95, '{"typical_hours": "class_hours"}'),

  -- Cleaning jobs → Places
  ('job_housekeeper', 'place_hotel_generic', 'available_at', 0.95, '{"typical_hours": "mornings_afternoons"}'),
  ('job_cleaner', 'place_gym_generic', 'available_at', 0.85, '{"typical_hours": "early_morning_late_night"}'),
  ('job_cleaner', 'place_hotel_generic', 'available_at', 0.8, '{"typical_hours": "mornings"}')
ON CONFLICT DO NOTHING;

-- Skill → Job relations (skills enable jobs in prospection context)
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  -- Technical skills → Digital jobs
  ('python', 'job_data_entry_remote', 'enables', 0.7, '{"advantage": "automation"}'),
  ('python', 'job_social_media', 'enables', 0.5, '{"advantage": "data_analysis"}'),
  ('excel', 'job_data_entry_remote', 'enables', 0.9, '{"advantage": "required_skill"}'),
  ('js', 'job_social_media', 'enables', 0.6, '{"advantage": "web_skills"}'),

  -- Language skills → Service/Tutoring
  ('english', 'job_tutor', 'enables', 0.85, '{"subject": "english_lessons"}'),
  ('french', 'job_tutor', 'enables', 0.9, '{"subject": "french_lessons"}'),
  ('english', 'job_waiter', 'enables', 0.6, '{"advantage": "tourist_areas"}'),
  ('english', 'job_barista', 'enables', 0.5, '{"advantage": "international_customers"}'),

  -- General skills (all can do these)
  ('french', 'job_cashier', 'enables', 0.5, '{"required": true}'),
  ('french', 'job_sales_associate', 'enables', 0.6, '{"required": true}'),
  ('french', 'job_babysitter', 'enables', 0.7, '{"required": true}')
ON CONFLICT DO NOTHING;

-- Category → Job direct relations (category recommends specific jobs)
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('cat_service', 'job_waiter', 'recommends', 0.95, '{"popularity": "high"}'),
  ('cat_service', 'job_barista', 'recommends', 0.9, '{"popularity": "high"}'),
  ('cat_service', 'job_bartender', 'recommends', 0.85, '{"popularity": "medium"}'),
  ('cat_service', 'job_kitchen_helper', 'recommends', 0.8, '{"popularity": "medium"}'),

  ('cat_retail', 'job_cashier', 'recommends', 0.95, '{"popularity": "high"}'),
  ('cat_retail', 'job_sales_associate', 'recommends', 0.9, '{"popularity": "high"}'),
  ('cat_retail', 'job_stock_clerk', 'recommends', 0.8, '{"popularity": "medium"}'),

  ('cat_tutoring', 'job_tutor', 'recommends', 0.95, '{"popularity": "high"}'),

  ('cat_campus', 'job_library_assistant', 'recommends', 0.9, '{"popularity": "high"}'),
  ('cat_campus', 'job_lab_monitor', 'recommends', 0.85, '{"popularity": "medium"}'),

  ('cat_cleaning', 'job_housekeeper', 'recommends', 0.9, '{"popularity": "high"}'),
  ('cat_cleaning', 'job_cleaner', 'recommends', 0.85, '{"popularity": "medium"}'),

  ('cat_digital', 'job_social_media', 'recommends', 0.9, '{"popularity": "high"}'),
  ('cat_digital', 'job_data_entry_remote', 'recommends', 0.85, '{"popularity": "medium"}'),

  ('cat_childcare', 'job_babysitter', 'recommends', 0.95, '{"popularity": "high"}'),
  ('cat_childcare', 'job_pet_sitter', 'recommends', 0.85, '{"popularity": "medium"}')
ON CONFLICT DO NOTHING;

-- ============================================
-- USEFUL QUERIES FOR PROSPECTION
-- ============================================

-- 1. Find jobs matching user skills in a category
-- SELECT j.name as job, s.name as skill, e.weight as match_score,
--        json_extract(j.properties, '$.hourly_rate') as rate
-- FROM student_edges e
-- JOIN student_nodes s ON e.source_id = s.id
-- JOIN student_nodes j ON e.target_id = j.id
-- WHERE s.id IN ('python', 'english')
-- AND e.relation_type = 'enables'
-- AND json_extract(j.properties, '$.category') = 'service'
-- ORDER BY e.weight DESC;

-- 2. Find place types for a prospection category
-- SELECT c.name as category, p.name as place_type, e.weight
-- FROM student_edges e
-- JOIN student_nodes c ON e.source_id = c.id
-- JOIN student_nodes p ON e.target_id = p.id
-- WHERE c.id = 'cat_service'
-- AND e.relation_type = 'contains'
-- ORDER BY e.weight DESC;

-- 3. Multi-hop: Skill → Job → Place (for skill-based place recommendations)
-- SELECT s.name as skill, j.name as job, p.name as place_type,
--        e1.weight as skill_match, e2.weight as job_availability
-- FROM student_edges e1
-- JOIN student_nodes s ON e1.source_id = s.id
-- JOIN student_nodes j ON e1.target_id = j.id
-- JOIN student_edges e2 ON e2.source_id = j.id
-- JOIN student_nodes p ON e2.target_id = p.id
-- WHERE s.id = 'python'
-- AND e1.relation_type = 'enables'
-- AND e2.relation_type = 'available_at'
-- ORDER BY e1.weight * e2.weight DESC;

-- 4. Find all jobs for a category with their place types
-- SELECT c.name as category, j.name as job, p.name as place_type,
--        json_extract(j.properties, '$.hourly_rate') as rate
-- FROM student_edges e1
-- JOIN student_nodes c ON e1.source_id = c.id
-- JOIN student_nodes j ON e1.target_id = j.id
-- JOIN student_edges e2 ON e2.source_id = j.id
-- JOIN student_nodes p ON e2.target_id = p.id
-- WHERE c.id = 'cat_service'
-- AND e1.relation_type = 'recommends'
-- AND e2.relation_type = 'available_at'
-- ORDER BY e1.weight DESC, e2.weight DESC;
