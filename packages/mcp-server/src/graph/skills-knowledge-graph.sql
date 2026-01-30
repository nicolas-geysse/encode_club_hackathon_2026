-- =============================================================================
-- Skills Knowledge Graph Data for DuckPGQ
-- =============================================================================
--
-- This file extends the student knowledge graph with:
-- - Fields of study nodes
-- - Monetizable skills nodes (with hourly_rate, platforms, effort metadata)
-- - Field → Skill relationships (has_monetizable_skill)
-- - Field → Field relationships (connects_to with strong/medium weights)
--
-- Data sourced from:
-- - docs/architecture/skills.md (skills by field)
-- - docs/architecture/skills-kg.md (field connections)
--
-- Note: Tables student_nodes and student_edges are created in student-knowledge-graph.sql
-- This file only adds data (INSERT statements)
-- =============================================================================

-- =============================================================================
-- Nodes: Fields of study
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('field_agriculture', 'field_of_study', 'Agriculture, Environment & Veterinary', '{"category": "applied"}'),
  ('field_arts', 'field_of_study', 'Arts, Design & Media', '{"category": "humanities"}'),
  ('field_business', 'field_of_study', 'Business, Management & Law', '{"category": "professional"}'),
  ('field_computer_science', 'field_of_study', 'Computer Science & IT', '{"category": "stem"}'),
  ('field_education', 'field_of_study', 'Education & Training', '{"category": "social"}'),
  ('field_engineering', 'field_of_study', 'Engineering & Technology', '{"category": "stem"}'),
  ('field_health', 'field_of_study', 'Health & Medicine', '{"category": "stem"}'),
  ('field_humanities', 'field_of_study', 'Humanities & Languages', '{"category": "humanities"}'),
  ('field_sciences', 'field_of_study', 'Natural Sciences & Mathematics', '{"category": "stem"}'),
  ('field_services', 'field_of_study', 'Services, Tourism & Hospitality', '{"category": "professional"}'),
  ('field_social_sciences', 'field_of_study', 'Social Sciences & Psychology', '{"category": "social"}'),
  ('field_other', 'field_of_study', 'Other', '{"category": "general"}');

-- =============================================================================
-- Nodes: Monetizable skills (Computer Science & IT)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_web_dev', 'monetizable_skill', 'Freelance web development',
   '{"hourly_rate": [20, 50], "platforms": ["Malt", "Upwork", "Fiverr"], "effort": 3, "field": "computer_science"}'),
  ('skill_mobile_dev', 'monetizable_skill', 'Mobile app development',
   '{"hourly_rate": [25, 60], "platforms": ["Upwork", "Toptal"], "effort": 4, "field": "computer_science"}'),
  ('skill_qa_testing', 'monetizable_skill', 'Debugging / QA testing',
   '{"hourly_rate": [15, 35], "platforms": ["uTest", "Testlio"], "effort": 2, "field": "computer_science"}'),
  ('skill_automation', 'monetizable_skill', 'Task automation (no-code/low-code)',
   '{"hourly_rate": [20, 45], "platforms": ["Upwork", "Fiverr"], "effort": 2, "field": "computer_science"}'),
  ('skill_it_support', 'monetizable_skill', 'Technical support / IT helpdesk',
   '{"hourly_rate": [12, 25], "platforms": ["Indeed", "Local"], "effort": 2, "field": "computer_science"}'),
  ('skill_chatbot', 'monetizable_skill', 'Chatbot creation',
   '{"hourly_rate": [25, 50], "platforms": ["Upwork", "Fiverr"], "effort": 3, "field": "computer_science"}'),
  ('skill_data_labeling', 'monetizable_skill', 'Data labeling / AI annotation',
   '{"hourly_rate": [10, 20], "platforms": ["Scale AI", "Appen", "Remotasks"], "effort": 1, "field": "computer_science"}'),
  ('skill_cybersecurity', 'monetizable_skill', 'Junior cybersecurity',
   '{"hourly_rate": [25, 55], "platforms": ["Bugcrowd", "HackerOne"], "effort": 4, "field": "computer_science"}');

-- =============================================================================
-- Nodes: Monetizable skills (Arts, Design & Media)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_graphic_design', 'monetizable_skill', 'Freelance graphic design',
   '{"hourly_rate": [20, 45], "platforms": ["99designs", "Fiverr", "Dribbble"], "effort": 2, "field": "arts"}'),
  ('skill_illustration', 'monetizable_skill', 'Digital illustration / mockup creation',
   '{"hourly_rate": [18, 40], "platforms": ["Etsy", "Redbubble", "Creative Market"], "effort": 2, "field": "arts"}'),
  ('skill_video_editing', 'monetizable_skill', 'Video editing',
   '{"hourly_rate": [20, 50], "platforms": ["Fiverr", "Upwork", "VideoHive"], "effort": 3, "field": "arts"}'),
  ('skill_photography', 'monetizable_skill', 'Event photography',
   '{"hourly_rate": [25, 75], "platforms": ["Local", "Shutterstock"], "effort": 3, "field": "arts"}'),
  ('skill_motion_design', 'monetizable_skill', 'Motion design animation',
   '{"hourly_rate": [30, 60], "platforms": ["Upwork", "VideoHive"], "effort": 4, "field": "arts"}'),
  ('skill_templates', 'monetizable_skill', 'Canva / Notion template creation',
   '{"hourly_rate": [15, 35], "platforms": ["Gumroad", "Etsy"], "effort": 2, "field": "arts"}'),
  ('skill_voiceover', 'monetizable_skill', 'Voice-over / narration',
   '{"hourly_rate": [20, 60], "platforms": ["Voices.com", "Fiverr"], "effort": 2, "field": "arts"}');

-- =============================================================================
-- Nodes: Monetizable skills (Business, Management & Law)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_social_media', 'monetizable_skill', 'Social media management for SMEs',
   '{"hourly_rate": [15, 35], "platforms": ["Upwork", "Local"], "effort": 2, "field": "business"}'),
  ('skill_copywriting', 'monetizable_skill', 'Copywriting / commercial writing',
   '{"hourly_rate": [20, 50], "platforms": ["Contently", "Upwork"], "effort": 2, "field": "business"}'),
  ('skill_consulting', 'monetizable_skill', 'Micro-business consulting',
   '{"hourly_rate": [25, 60], "platforms": ["Clarity.fm", "Upwork"], "effort": 3, "field": "business"}'),
  ('skill_virtual_assistant', 'monetizable_skill', 'Virtual assistant',
   '{"hourly_rate": [12, 25], "platforms": ["Belay", "Time Etc"], "effort": 1, "field": "business"}'),
  ('skill_lead_gen', 'monetizable_skill', 'Lead generation / B2B prospecting',
   '{"hourly_rate": [15, 35], "platforms": ["Upwork", "Local"], "effort": 2, "field": "business"}'),
  ('skill_competitive_analysis', 'monetizable_skill', 'Quick competitive analysis',
   '{"hourly_rate": [20, 45], "platforms": ["Upwork", "Local"], "effort": 2, "field": "business"}'),
  ('skill_community_mgmt', 'monetizable_skill', 'Community management',
   '{"hourly_rate": [15, 30], "platforms": ["Discord", "Facebook"], "effort": 2, "field": "business"}');

-- =============================================================================
-- Nodes: Monetizable skills (Education & Training)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_online_tutoring', 'monetizable_skill', 'Online tutoring',
   '{"hourly_rate": [15, 40], "platforms": ["Superprof", "Preply", "Wyzant"], "effort": 2, "field": "education"}'),
  ('skill_course_creation', 'monetizable_skill', 'Online course creation',
   '{"hourly_rate": [0, 100], "platforms": ["Udemy", "Skillshare", "Teachable"], "effort": 4, "field": "education"}'),
  ('skill_proofreading', 'monetizable_skill', 'Academic proofreading / editing',
   '{"hourly_rate": [15, 30], "platforms": ["Upwork", "Scribbr"], "effort": 2, "field": "education"}'),
  ('skill_academic_coaching', 'monetizable_skill', 'Academic guidance coaching',
   '{"hourly_rate": [20, 45], "platforms": ["Local", "Upwork"], "effort": 2, "field": "education"}'),
  ('skill_workshops', 'monetizable_skill', 'Workshop / webinar facilitation',
   '{"hourly_rate": [25, 75], "platforms": ["Local", "Eventbrite"], "effort": 3, "field": "education"}'),
  ('skill_edu_translation', 'monetizable_skill', 'Educational materials translation',
   '{"hourly_rate": [15, 35], "platforms": ["ProZ", "TranslatorsCafe"], "effort": 2, "field": "education"}');

-- =============================================================================
-- Nodes: Monetizable skills (Engineering & Technology)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_3d_modeling', 'monetizable_skill', '3D modeling / CAD',
   '{"hourly_rate": [25, 55], "platforms": ["Upwork", "CGTrader"], "effort": 3, "field": "engineering"}'),
  ('skill_3d_printing', 'monetizable_skill', 'On-demand 3D printing',
   '{"hourly_rate": [20, 50], "platforms": ["Shapeways", "Local"], "effort": 3, "field": "engineering"}'),
  ('skill_electronics_repair', 'monetizable_skill', 'Electronics repair',
   '{"hourly_rate": [20, 45], "platforms": ["Local", "iFixit"], "effort": 3, "field": "engineering"}'),
  ('skill_iot', 'monetizable_skill', 'IoT / Arduino projects development',
   '{"hourly_rate": [25, 50], "platforms": ["Upwork", "Freelancer"], "effort": 3, "field": "engineering"}'),
  ('skill_tech_writing', 'monetizable_skill', 'Technical writing',
   '{"hourly_rate": [25, 55], "platforms": ["Contently", "Upwork"], "effort": 2, "field": "engineering"}'),
  ('skill_cad_support', 'monetizable_skill', 'CAD/CAM support',
   '{"hourly_rate": [20, 45], "platforms": ["Upwork", "Local"], "effort": 2, "field": "engineering"}'),
  ('skill_smart_home', 'monetizable_skill', 'Smart home energy optimization',
   '{"hourly_rate": [30, 60], "platforms": ["Local", "TaskRabbit"], "effort": 3, "field": "engineering"}');

-- =============================================================================
-- Nodes: Monetizable skills (Health & Medicine)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_medical_transcription', 'monetizable_skill', 'Medical transcription',
   '{"hourly_rate": [15, 30], "platforms": ["Rev", "TranscribeMe"], "effort": 2, "field": "health"}'),
  ('skill_health_writing', 'monetizable_skill', 'Health / wellness content writing',
   '{"hourly_rate": [20, 45], "platforms": ["Healthline", "Upwork"], "effort": 2, "field": "health"}'),
  ('skill_nutrition_coaching', 'monetizable_skill', 'Amateur nutrition coaching',
   '{"hourly_rate": [15, 35], "platforms": ["Local", "Thumbtack"], "effort": 2, "field": "health"}'),
  ('skill_fitness_classes', 'monetizable_skill', 'Online fitness/yoga classes',
   '{"hourly_rate": [20, 50], "platforms": ["Zoom", "YouTube", "Instagram"], "effort": 3, "field": "health"}'),
  ('skill_medical_admin', 'monetizable_skill', 'Medical office admin support',
   '{"hourly_rate": [15, 28], "platforms": ["Local", "Indeed"], "effort": 2, "field": "health"}'),
  ('skill_medical_translation', 'monetizable_skill', 'Medical document translation',
   '{"hourly_rate": [20, 45], "platforms": ["ProZ", "Upwork"], "effort": 3, "field": "health"}'),
  ('skill_health_social', 'monetizable_skill', 'Social media content for health professionals',
   '{"hourly_rate": [18, 40], "platforms": ["Local", "Upwork"], "effort": 2, "field": "health"}');

-- =============================================================================
-- Nodes: Monetizable skills (Humanities & Languages)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_translation', 'monetizable_skill', 'Freelance translation / localization',
   '{"hourly_rate": [18, 45], "platforms": ["ProZ", "Gengo", "TranslatorsCafe"], "effort": 2, "field": "humanities"}'),
  ('skill_language_lessons', 'monetizable_skill', 'Online language lessons',
   '{"hourly_rate": [15, 40], "platforms": ["italki", "Preply", "Verbling"], "effort": 2, "field": "humanities"}'),
  ('skill_cultural_writing', 'monetizable_skill', 'Cultural content writing',
   '{"hourly_rate": [18, 40], "platforms": ["Medium", "Upwork"], "effort": 2, "field": "humanities"}'),
  ('skill_subtitling', 'monetizable_skill', 'Video subtitling',
   '{"hourly_rate": [15, 30], "platforms": ["Rev", "Amara"], "effort": 2, "field": "humanities"}'),
  ('skill_transcription', 'monetizable_skill', 'Audio transcription',
   '{"hourly_rate": [12, 25], "platforms": ["Rev", "TranscribeMe", "GoTranscript"], "effort": 1, "field": "humanities"}'),
  ('skill_research', 'monetizable_skill', 'Documentary research / fact-checking',
   '{"hourly_rate": [20, 45], "platforms": ["Upwork", "Freelancer"], "effort": 2, "field": "humanities"}'),
  ('skill_tour_guide', 'monetizable_skill', 'Local tour guide / virtual tours',
   '{"hourly_rate": [20, 50], "platforms": ["Airbnb Experiences", "GetYourGuide"], "effort": 3, "field": "humanities"}');

-- =============================================================================
-- Nodes: Monetizable skills (Natural Sciences & Mathematics)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_science_tutoring', 'monetizable_skill', 'Online science / math tutoring',
   '{"hourly_rate": [18, 45], "platforms": ["Superprof", "Wyzant"], "effort": 2, "field": "sciences"}'),
  ('skill_data_analysis', 'monetizable_skill', 'Basic data analysis',
   '{"hourly_rate": [20, 45], "platforms": ["Upwork", "Fiverr"], "effort": 2, "field": "sciences"}'),
  ('skill_science_content', 'monetizable_skill', 'Popular science content creation',
   '{"hourly_rate": [15, 40], "platforms": ["YouTube", "TikTok", "Medium"], "effort": 3, "field": "sciences"}'),
  ('skill_data_entry_science', 'monetizable_skill', 'Data entry and cleaning',
   '{"hourly_rate": [10, 20], "platforms": ["Upwork", "Clickworker"], "effort": 1, "field": "sciences"}'),
  ('skill_research_assist', 'monetizable_skill', 'Academic research assistance',
   '{"hourly_rate": [18, 35], "platforms": ["Upwork", "Local"], "effort": 2, "field": "sciences"}'),
  ('skill_science_proofreading', 'monetizable_skill', 'Scientific proofreading',
   '{"hourly_rate": [20, 40], "platforms": ["Scribbr", "Upwork"], "effort": 2, "field": "sciences"}'),
  ('skill_calculators', 'monetizable_skill', 'Online simulator/calculator creation',
   '{"hourly_rate": [25, 50], "platforms": ["Upwork", "Fiverr"], "effort": 3, "field": "sciences"}');

-- =============================================================================
-- Nodes: Monetizable skills (Services, Tourism & Hospitality)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_event_org', 'monetizable_skill', 'Virtual event organization',
   '{"hourly_rate": [20, 45], "platforms": ["Upwork", "Eventbrite"], "effort": 3, "field": "services"}'),
  ('skill_travel_itinerary', 'monetizable_skill', 'Custom travel itinerary creation',
   '{"hourly_rate": [25, 60], "platforms": ["Gumroad", "Etsy"], "effort": 3, "field": "services"}'),
  ('skill_airbnb_mgmt', 'monetizable_skill', 'Airbnb management / short-term concierge',
   '{"hourly_rate": [15, 30], "platforms": ["Local", "Airbnb Co-Host"], "effort": 2, "field": "services"}'),
  ('skill_travel_writing', 'monetizable_skill', 'Travel reviews / content writing',
   '{"hourly_rate": [15, 35], "platforms": ["Travel blogs", "Instagram"], "effort": 2, "field": "services"}'),
  ('skill_food_photo', 'monetizable_skill', 'Food photography',
   '{"hourly_rate": [25, 60], "platforms": ["Local", "Shutterstock"], "effort": 3, "field": "services"}'),
  ('skill_mystery_shopping', 'monetizable_skill', 'Mystery shopping / service quality evaluations',
   '{"hourly_rate": [12, 25], "platforms": ["BestMark", "Market Force"], "effort": 1, "field": "services"}'),
  ('skill_menu_translation', 'monetizable_skill', 'Menu / tourism materials translation',
   '{"hourly_rate": [15, 35], "platforms": ["Local", "ProZ"], "effort": 2, "field": "services"}');

-- =============================================================================
-- Nodes: Monetizable skills (Social Sciences & Psychology)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_moderation', 'monetizable_skill', 'Online community moderation',
   '{"hourly_rate": [12, 25], "platforms": ["Discord", "Reddit", "Facebook"], "effort": 2, "field": "social_sciences"}'),
  ('skill_ux_research', 'monetizable_skill', 'UX research / user testing',
   '{"hourly_rate": [20, 50], "platforms": ["UserTesting", "Respondent"], "effort": 2, "field": "social_sciences"}'),
  ('skill_psych_writing', 'monetizable_skill', 'Psychology / personal development content writing',
   '{"hourly_rate": [18, 40], "platforms": ["Medium", "Psychology Today"], "effort": 2, "field": "social_sciences"}'),
  ('skill_qual_transcription', 'monetizable_skill', 'Qualitative interview transcription',
   '{"hourly_rate": [15, 30], "platforms": ["Rev", "Upwork"], "effort": 2, "field": "social_sciences"}'),
  ('skill_productivity_coaching', 'monetizable_skill', 'Student / productivity coaching',
   '{"hourly_rate": [20, 45], "platforms": ["Local", "Thumbtack"], "effort": 2, "field": "social_sciences"}'),
  ('skill_support_groups', 'monetizable_skill', 'Support group / peer-to-peer support facilitation',
   '{"hourly_rate": [15, 35], "platforms": ["Discord", "Local"], "effort": 2, "field": "social_sciences"}'),
  ('skill_surveys', 'monetizable_skill', 'Surveys and field studies',
   '{"hourly_rate": [12, 28], "platforms": ["Upwork", "Respondent"], "effort": 2, "field": "social_sciences"}');

-- =============================================================================
-- Nodes: Monetizable skills (Agriculture, Environment & Veterinary)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_urban_gardening', 'monetizable_skill', 'Urban gardening / permaculture consulting',
   '{"hourly_rate": [15, 35], "platforms": ["Local", "Thumbtack"], "effort": 2, "field": "agriculture"}'),
  ('skill_nature_photo', 'monetizable_skill', 'Nature / wildlife photography',
   '{"hourly_rate": [20, 50], "platforms": ["Shutterstock", "Adobe Stock"], "effort": 3, "field": "agriculture"}'),
  ('skill_env_writing', 'monetizable_skill', 'Environmental content writing',
   '{"hourly_rate": [18, 40], "platforms": ["Upwork", "eco blogs"], "effort": 2, "field": "agriculture"}'),
  ('skill_pet_sitting', 'monetizable_skill', 'Pet-sitting / dog-walking',
   '{"hourly_rate": [12, 25], "platforms": ["Rover", "Wag", "Local"], "effort": 2, "field": "agriculture"}'),
  ('skill_eco_content', 'monetizable_skill', 'TikTok/YouTube eco content creation',
   '{"hourly_rate": [15, 50], "platforms": ["TikTok", "YouTube", "Instagram"], "effort": 3, "field": "agriculture"}'),
  ('skill_eco_social_media', 'monetizable_skill', 'Social media management for organic/local brands',
   '{"hourly_rate": [15, 35], "platforms": ["Upwork", "Local"], "effort": 2, "field": "agriculture"}');

-- =============================================================================
-- Nodes: Monetizable skills (Other / General)
-- =============================================================================

INSERT INTO student_nodes (id, domain, name, properties) VALUES
  ('skill_gen_va', 'monetizable_skill', 'General virtual assistant',
   '{"hourly_rate": [10, 22], "platforms": ["Belay", "Time Etc"], "effort": 1, "field": "other"}'),
  ('skill_gen_data_entry', 'monetizable_skill', 'Data entry',
   '{"hourly_rate": [8, 18], "platforms": ["Upwork", "Clickworker"], "effort": 1, "field": "other"}'),
  ('skill_content_mod', 'monetizable_skill', 'Content moderation',
   '{"hourly_rate": [12, 22], "platforms": ["Appen", "Remote companies"], "effort": 1, "field": "other"}'),
  ('skill_customer_service', 'monetizable_skill', 'Customer service / support',
   '{"hourly_rate": [10, 20], "platforms": ["Indeed", "Remote companies"], "effort": 1, "field": "other"}'),
  ('skill_user_testing', 'monetizable_skill', 'Paid user testing',
   '{"hourly_rate": [10, 30], "platforms": ["UserTesting", "Testbirds"], "effort": 1, "field": "other"}'),
  ('skill_microtasks', 'monetizable_skill', 'Online micro-tasks',
   '{"hourly_rate": [5, 15], "platforms": ["Amazon MTurk", "Clickworker"], "effort": 1, "field": "other"}'),
  ('skill_delivery', 'monetizable_skill', 'Food delivery / courier',
   '{"hourly_rate": [10, 20], "platforms": ["Uber Eats", "Deliveroo", "DoorDash"], "effort": 2, "field": "other"}'),
  ('skill_childcare', 'monetizable_skill', 'Babysitting / childcare',
   '{"hourly_rate": [12, 25], "platforms": ["Care.com", "Sittercity"], "effort": 2, "field": "other"}');

-- =============================================================================
-- Edges: Field → Skill (has_monetizable_skill)
-- =============================================================================

-- Computer Science & IT
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_computer_science', 'skill_web_dev', 'has_monetizable_skill', 1.0, '{}'),
  ('field_computer_science', 'skill_mobile_dev', 'has_monetizable_skill', 1.0, '{}'),
  ('field_computer_science', 'skill_qa_testing', 'has_monetizable_skill', 1.0, '{}'),
  ('field_computer_science', 'skill_automation', 'has_monetizable_skill', 1.0, '{}'),
  ('field_computer_science', 'skill_it_support', 'has_monetizable_skill', 1.0, '{}'),
  ('field_computer_science', 'skill_chatbot', 'has_monetizable_skill', 1.0, '{}'),
  ('field_computer_science', 'skill_data_labeling', 'has_monetizable_skill', 1.0, '{}'),
  ('field_computer_science', 'skill_cybersecurity', 'has_monetizable_skill', 1.0, '{}');

-- Arts, Design & Media
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_arts', 'skill_graphic_design', 'has_monetizable_skill', 1.0, '{}'),
  ('field_arts', 'skill_illustration', 'has_monetizable_skill', 1.0, '{}'),
  ('field_arts', 'skill_video_editing', 'has_monetizable_skill', 1.0, '{}'),
  ('field_arts', 'skill_photography', 'has_monetizable_skill', 1.0, '{}'),
  ('field_arts', 'skill_motion_design', 'has_monetizable_skill', 1.0, '{}'),
  ('field_arts', 'skill_templates', 'has_monetizable_skill', 1.0, '{}'),
  ('field_arts', 'skill_voiceover', 'has_monetizable_skill', 1.0, '{}');

-- Business, Management & Law
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_business', 'skill_social_media', 'has_monetizable_skill', 1.0, '{}'),
  ('field_business', 'skill_copywriting', 'has_monetizable_skill', 1.0, '{}'),
  ('field_business', 'skill_consulting', 'has_monetizable_skill', 1.0, '{}'),
  ('field_business', 'skill_virtual_assistant', 'has_monetizable_skill', 1.0, '{}'),
  ('field_business', 'skill_lead_gen', 'has_monetizable_skill', 1.0, '{}'),
  ('field_business', 'skill_competitive_analysis', 'has_monetizable_skill', 1.0, '{}'),
  ('field_business', 'skill_community_mgmt', 'has_monetizable_skill', 1.0, '{}');

-- Education & Training
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_education', 'skill_online_tutoring', 'has_monetizable_skill', 1.0, '{}'),
  ('field_education', 'skill_course_creation', 'has_monetizable_skill', 1.0, '{}'),
  ('field_education', 'skill_proofreading', 'has_monetizable_skill', 1.0, '{}'),
  ('field_education', 'skill_academic_coaching', 'has_monetizable_skill', 1.0, '{}'),
  ('field_education', 'skill_workshops', 'has_monetizable_skill', 1.0, '{}'),
  ('field_education', 'skill_edu_translation', 'has_monetizable_skill', 1.0, '{}');

-- Engineering & Technology
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_engineering', 'skill_3d_modeling', 'has_monetizable_skill', 1.0, '{}'),
  ('field_engineering', 'skill_3d_printing', 'has_monetizable_skill', 1.0, '{}'),
  ('field_engineering', 'skill_electronics_repair', 'has_monetizable_skill', 1.0, '{}'),
  ('field_engineering', 'skill_iot', 'has_monetizable_skill', 1.0, '{}'),
  ('field_engineering', 'skill_tech_writing', 'has_monetizable_skill', 1.0, '{}'),
  ('field_engineering', 'skill_cad_support', 'has_monetizable_skill', 1.0, '{}'),
  ('field_engineering', 'skill_smart_home', 'has_monetizable_skill', 1.0, '{}');

-- Health & Medicine
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_health', 'skill_medical_transcription', 'has_monetizable_skill', 1.0, '{}'),
  ('field_health', 'skill_health_writing', 'has_monetizable_skill', 1.0, '{}'),
  ('field_health', 'skill_nutrition_coaching', 'has_monetizable_skill', 1.0, '{}'),
  ('field_health', 'skill_fitness_classes', 'has_monetizable_skill', 1.0, '{}'),
  ('field_health', 'skill_medical_admin', 'has_monetizable_skill', 1.0, '{}'),
  ('field_health', 'skill_medical_translation', 'has_monetizable_skill', 1.0, '{}'),
  ('field_health', 'skill_health_social', 'has_monetizable_skill', 1.0, '{}');

-- Humanities & Languages
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_humanities', 'skill_translation', 'has_monetizable_skill', 1.0, '{}'),
  ('field_humanities', 'skill_language_lessons', 'has_monetizable_skill', 1.0, '{}'),
  ('field_humanities', 'skill_cultural_writing', 'has_monetizable_skill', 1.0, '{}'),
  ('field_humanities', 'skill_subtitling', 'has_monetizable_skill', 1.0, '{}'),
  ('field_humanities', 'skill_transcription', 'has_monetizable_skill', 1.0, '{}'),
  ('field_humanities', 'skill_research', 'has_monetizable_skill', 1.0, '{}'),
  ('field_humanities', 'skill_tour_guide', 'has_monetizable_skill', 1.0, '{}');

-- Natural Sciences & Mathematics
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_sciences', 'skill_science_tutoring', 'has_monetizable_skill', 1.0, '{}'),
  ('field_sciences', 'skill_data_analysis', 'has_monetizable_skill', 1.0, '{}'),
  ('field_sciences', 'skill_science_content', 'has_monetizable_skill', 1.0, '{}'),
  ('field_sciences', 'skill_data_entry_science', 'has_monetizable_skill', 1.0, '{}'),
  ('field_sciences', 'skill_research_assist', 'has_monetizable_skill', 1.0, '{}'),
  ('field_sciences', 'skill_science_proofreading', 'has_monetizable_skill', 1.0, '{}'),
  ('field_sciences', 'skill_calculators', 'has_monetizable_skill', 1.0, '{}');

-- Services, Tourism & Hospitality
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_services', 'skill_event_org', 'has_monetizable_skill', 1.0, '{}'),
  ('field_services', 'skill_travel_itinerary', 'has_monetizable_skill', 1.0, '{}'),
  ('field_services', 'skill_airbnb_mgmt', 'has_monetizable_skill', 1.0, '{}'),
  ('field_services', 'skill_travel_writing', 'has_monetizable_skill', 1.0, '{}'),
  ('field_services', 'skill_food_photo', 'has_monetizable_skill', 1.0, '{}'),
  ('field_services', 'skill_mystery_shopping', 'has_monetizable_skill', 1.0, '{}'),
  ('field_services', 'skill_menu_translation', 'has_monetizable_skill', 1.0, '{}');

-- Social Sciences & Psychology
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_social_sciences', 'skill_moderation', 'has_monetizable_skill', 1.0, '{}'),
  ('field_social_sciences', 'skill_ux_research', 'has_monetizable_skill', 1.0, '{}'),
  ('field_social_sciences', 'skill_psych_writing', 'has_monetizable_skill', 1.0, '{}'),
  ('field_social_sciences', 'skill_qual_transcription', 'has_monetizable_skill', 1.0, '{}'),
  ('field_social_sciences', 'skill_productivity_coaching', 'has_monetizable_skill', 1.0, '{}'),
  ('field_social_sciences', 'skill_support_groups', 'has_monetizable_skill', 1.0, '{}'),
  ('field_social_sciences', 'skill_surveys', 'has_monetizable_skill', 1.0, '{}');

-- Agriculture, Environment & Veterinary
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_agriculture', 'skill_urban_gardening', 'has_monetizable_skill', 1.0, '{}'),
  ('field_agriculture', 'skill_nature_photo', 'has_monetizable_skill', 1.0, '{}'),
  ('field_agriculture', 'skill_env_writing', 'has_monetizable_skill', 1.0, '{}'),
  ('field_agriculture', 'skill_pet_sitting', 'has_monetizable_skill', 1.0, '{}'),
  ('field_agriculture', 'skill_eco_content', 'has_monetizable_skill', 1.0, '{}'),
  ('field_agriculture', 'skill_eco_social_media', 'has_monetizable_skill', 1.0, '{}');

-- Other
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_other', 'skill_gen_va', 'has_monetizable_skill', 1.0, '{}'),
  ('field_other', 'skill_gen_data_entry', 'has_monetizable_skill', 1.0, '{}'),
  ('field_other', 'skill_content_mod', 'has_monetizable_skill', 1.0, '{}'),
  ('field_other', 'skill_customer_service', 'has_monetizable_skill', 1.0, '{}'),
  ('field_other', 'skill_user_testing', 'has_monetizable_skill', 1.0, '{}'),
  ('field_other', 'skill_microtasks', 'has_monetizable_skill', 1.0, '{}'),
  ('field_other', 'skill_delivery', 'has_monetizable_skill', 1.0, '{}'),
  ('field_other', 'skill_childcare', 'has_monetizable_skill', 1.0, '{}');

-- =============================================================================
-- Edges: Field → Field (connects_to)
-- =============================================================================

-- Computer Science & IT connections
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_computer_science', 'field_business', 'connects_to', 0.9, '{"type": "strong", "skills": ["data analytics", "automation", "digital platforms"]}'),
  ('field_computer_science', 'field_arts', 'connects_to', 0.9, '{"type": "strong", "skills": ["web design", "UX/UI", "creative tech"]}'),
  ('field_computer_science', 'field_engineering', 'connects_to', 0.9, '{"type": "strong", "skills": ["embedded systems", "IoT", "robotics"]}'),
  ('field_computer_science', 'field_sciences', 'connects_to', 0.9, '{"type": "strong", "skills": ["data science", "modeling", "scientific computing"]}'),
  ('field_computer_science', 'field_health', 'connects_to', 0.7, '{"type": "medium", "skills": ["health informatics", "medical software"]}'),
  ('field_computer_science', 'field_social_sciences', 'connects_to', 0.7, '{"type": "medium", "skills": ["UX research", "behavioral analytics"]}'),
  ('field_computer_science', 'field_education', 'connects_to', 0.7, '{"type": "medium", "skills": ["EdTech", "e-learning platforms"]}');

-- Business connections
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_business', 'field_computer_science', 'connects_to', 0.9, '{"type": "strong", "skills": ["fintech", "business intelligence", "automation"]}'),
  ('field_business', 'field_social_sciences', 'connects_to', 0.9, '{"type": "strong", "skills": ["market research", "consumer behavior", "HR"]}'),
  ('field_business', 'field_arts', 'connects_to', 0.7, '{"type": "medium", "skills": ["branding", "marketing design", "content strategy"]}'),
  ('field_business', 'field_engineering', 'connects_to', 0.7, '{"type": "medium", "skills": ["project management", "product development"]}'),
  ('field_business', 'field_services', 'connects_to', 0.7, '{"type": "medium", "skills": ["hospitality management", "event planning"]}'),
  ('field_business', 'field_health', 'connects_to', 0.7, '{"type": "medium", "skills": ["healthcare administration", "pharmaceutical management"]}');

-- Arts connections
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_arts', 'field_computer_science', 'connects_to', 0.9, '{"type": "strong", "skills": ["digital art", "UX/UI", "web design"]}'),
  ('field_arts', 'field_humanities', 'connects_to', 0.9, '{"type": "strong", "skills": ["storytelling", "cultural studies", "content creation"]}'),
  ('field_arts', 'field_business', 'connects_to', 0.7, '{"type": "medium", "skills": ["marketing", "branding", "advertising"]}'),
  ('field_arts', 'field_social_sciences', 'connects_to', 0.7, '{"type": "medium", "skills": ["design psychology", "user research"]}'),
  ('field_arts', 'field_education', 'connects_to', 0.7, '{"type": "medium", "skills": ["educational media", "instructional design"]}');

-- Engineering connections
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_engineering', 'field_computer_science', 'connects_to', 0.9, '{"type": "strong", "skills": ["software engineering", "embedded systems"]}'),
  ('field_engineering', 'field_sciences', 'connects_to', 0.9, '{"type": "strong", "skills": ["applied physics", "materials science"]}'),
  ('field_engineering', 'field_business', 'connects_to', 0.7, '{"type": "medium", "skills": ["project management", "industrial management"]}'),
  ('field_engineering', 'field_health', 'connects_to', 0.7, '{"type": "medium", "skills": ["biomedical engineering", "medical devices"]}'),
  ('field_engineering', 'field_agriculture', 'connects_to', 0.7, '{"type": "medium", "skills": ["environmental engineering", "agritech"]}');

-- Sciences connections
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_sciences', 'field_computer_science', 'connects_to', 0.9, '{"type": "strong", "skills": ["data science", "computational modeling"]}'),
  ('field_sciences', 'field_engineering', 'connects_to', 0.9, '{"type": "strong", "skills": ["applied sciences", "research R&D"]}'),
  ('field_sciences', 'field_health', 'connects_to', 0.9, '{"type": "strong", "skills": ["biochemistry", "medical research"]}'),
  ('field_sciences', 'field_agriculture', 'connects_to', 0.7, '{"type": "medium", "skills": ["ecology", "environmental science"]}'),
  ('field_sciences', 'field_social_sciences', 'connects_to', 0.7, '{"type": "medium", "skills": ["quantitative research", "statistical analysis"]}');

-- Health connections
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_health', 'field_sciences', 'connects_to', 0.9, '{"type": "strong", "skills": ["medical research", "biochemistry"]}'),
  ('field_health', 'field_computer_science', 'connects_to', 0.7, '{"type": "medium", "skills": ["health tech", "medical AI"]}'),
  ('field_health', 'field_engineering', 'connects_to', 0.7, '{"type": "medium", "skills": ["biomedical devices", "prosthetics"]}'),
  ('field_health', 'field_social_sciences', 'connects_to', 0.7, '{"type": "medium", "skills": ["public health", "mental health"]}'),
  ('field_health', 'field_business', 'connects_to', 0.7, '{"type": "medium", "skills": ["healthcare management", "pharma business"]}');

-- Social Sciences connections
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_social_sciences', 'field_business', 'connects_to', 0.9, '{"type": "strong", "skills": ["organizational behavior", "consumer research"]}'),
  ('field_social_sciences', 'field_humanities', 'connects_to', 0.9, '{"type": "strong", "skills": ["sociology", "cultural studies"]}'),
  ('field_social_sciences', 'field_computer_science', 'connects_to', 0.7, '{"type": "medium", "skills": ["UX research", "data ethics"]}'),
  ('field_social_sciences', 'field_health', 'connects_to', 0.7, '{"type": "medium", "skills": ["mental health", "public health"]}'),
  ('field_social_sciences', 'field_education', 'connects_to', 0.7, '{"type": "medium", "skills": ["educational psychology", "pedagogy"]}'),
  ('field_social_sciences', 'field_arts', 'connects_to', 0.7, '{"type": "medium", "skills": ["user-centered design", "media studies"]}');

-- Humanities connections
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_humanities', 'field_arts', 'connects_to', 0.9, '{"type": "strong", "skills": ["content creation", "storytelling", "cultural media"]}'),
  ('field_humanities', 'field_social_sciences', 'connects_to', 0.9, '{"type": "strong", "skills": ["cultural studies", "anthropology"]}'),
  ('field_humanities', 'field_education', 'connects_to', 0.7, '{"type": "medium", "skills": ["language teaching", "curriculum development"]}'),
  ('field_humanities', 'field_business', 'connects_to', 0.7, '{"type": "medium", "skills": ["communication", "international business"]}');

-- Education connections
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_education', 'field_social_sciences', 'connects_to', 0.9, '{"type": "strong", "skills": ["learning theory", "educational psychology"]}'),
  ('field_education', 'field_computer_science', 'connects_to', 0.7, '{"type": "medium", "skills": ["EdTech", "online learning"]}'),
  ('field_education', 'field_humanities', 'connects_to', 0.7, '{"type": "medium", "skills": ["language education", "literacy"]}'),
  ('field_education', 'field_arts', 'connects_to', 0.7, '{"type": "medium", "skills": ["instructional design", "educational media"]}'),
  ('field_education', 'field_sciences', 'connects_to', 0.7, '{"type": "medium", "skills": ["STEM education"]}');

-- Agriculture connections
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_agriculture', 'field_sciences', 'connects_to', 0.9, '{"type": "strong", "skills": ["ecology", "environmental science"]}'),
  ('field_agriculture', 'field_engineering', 'connects_to', 0.7, '{"type": "medium", "skills": ["environmental engineering", "sustainable tech"]}'),
  ('field_agriculture', 'field_health', 'connects_to', 0.7, '{"type": "medium", "skills": ["veterinary medicine", "public health"]}');

-- Services connections
INSERT INTO student_edges (source_id, target_id, relation_type, weight, properties) VALUES
  ('field_services', 'field_business', 'connects_to', 0.7, '{"type": "medium", "skills": ["hospitality management", "event planning"]}'),
  ('field_services', 'field_arts', 'connects_to', 0.7, '{"type": "medium", "skills": ["tourism marketing", "hospitality branding"]}'),
  ('field_services', 'field_humanities', 'connects_to', 0.7, '{"type": "medium", "skills": ["cultural tourism", "tour guiding"]}');
