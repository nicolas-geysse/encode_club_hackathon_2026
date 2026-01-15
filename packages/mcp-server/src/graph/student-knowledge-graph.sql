-- Student Life Navigator - Knowledge Graph Schema
-- DuckDB + DuckPGQ

-- ============================================
-- NODES: Student universe
-- ============================================
CREATE TABLE student_nodes (
  id VARCHAR PRIMARY KEY,
  domain VARCHAR,  -- 'skill', 'job', 'diploma', 'career', 'expense', 'solution'
  name VARCHAR,
  properties JSON
);

-- Skills
INSERT INTO student_nodes VALUES
  ('python', 'skill', 'Python', '{"level": "intermediate", "demand": 0.9}'),
  ('sql', 'skill', 'SQL', '{"level": "beginner", "demand": 0.8}'),
  ('js', 'skill', 'JavaScript', '{"level": "intermediate", "demand": 0.85}'),
  ('excel', 'skill', 'Excel', '{"level": "advanced", "demand": 0.7}'),
  ('english', 'skill', 'English', '{"level": "fluent", "demand": 0.6}'),
  ('french', 'skill', 'French', '{"level": "native", "demand": 0.5}');

-- Student jobs
INSERT INTO student_nodes VALUES
  ('freelance_dev', 'job', 'Freelance Dev (Malt)', '{"hourly_rate": 25, "flexibility": 0.9, "min_hours": 5}'),
  ('data_entry', 'job', 'Data Entry', '{"hourly_rate": 12, "flexibility": 0.7, "min_hours": 10}'),
  ('tutoring', 'job', 'Private Tutoring', '{"hourly_rate": 20, "flexibility": 0.8, "min_hours": 2}'),
  ('mcdo', 'job', 'Fast-food', '{"hourly_rate": 11.65, "flexibility": 0.3, "min_hours": 15}'),
  ('retail', 'job', 'Retail', '{"hourly_rate": 11.65, "flexibility": 0.4, "min_hours": 12}'),
  ('babysitting', 'job', 'Babysitting', '{"hourly_rate": 12, "flexibility": 0.85, "min_hours": 3}'),
  ('translation', 'job', 'Translation', '{"hourly_rate": 18, "flexibility": 0.95, "min_hours": 1}');

-- Diplomas
INSERT INTO student_nodes VALUES
  ('l1_info', 'diploma', 'L1 Computer Science', '{"duration_years": 1, "yearly_cost": 170}'),
  ('l2_info', 'diploma', 'L2 Computer Science', '{"duration_years": 2, "yearly_cost": 170}'),
  ('l3_info', 'diploma', 'L3 Computer Science', '{"duration_years": 3, "yearly_cost": 170}'),
  ('master_dev', 'diploma', 'Master Software Dev', '{"duration_years": 5, "yearly_cost": 243}'),
  ('master_data', 'diploma', 'Master Data Science', '{"duration_years": 5, "yearly_cost": 243}');

-- Careers
INSERT INTO student_nodes VALUES
  ('dev_junior', 'career', 'Junior Developer', '{"starting_salary": 35000, "growth_rate": 0.15}'),
  ('dev_senior', 'career', 'Senior Developer', '{"starting_salary": 50000, "growth_rate": 0.10}'),
  ('data_analyst', 'career', 'Data Analyst', '{"starting_salary": 38000, "growth_rate": 0.12}'),
  ('data_scientist', 'career', 'Data Scientist', '{"starting_salary": 45000, "growth_rate": 0.15}'),
  ('tech_lead', 'career', 'Tech Lead', '{"starting_salary": 60000, "growth_rate": 0.08}');

-- Expenses
INSERT INTO student_nodes VALUES
  ('rent', 'expense', 'Rent', '{"avg_student": 500, "category": "housing", "priority": 1}'),
  ('food', 'expense', 'Food', '{"avg_student": 200, "category": "daily", "priority": 2}'),
  ('transport', 'expense', 'Transport', '{"avg_student": 50, "category": "mobility", "priority": 3}'),
  ('phone', 'expense', 'Phone Plan', '{"avg_student": 20, "category": "communication", "priority": 4}'),
  ('insurance', 'expense', 'Insurance', '{"avg_student": 30, "category": "mandatory", "priority": 5}'),
  ('leisure', 'expense', 'Leisure', '{"avg_student": 100, "category": "optional", "priority": 6}');

-- Budget solutions
INSERT INTO student_nodes VALUES
  ('coloc', 'solution', 'Roommate', '{"savings_pct": 0.30, "effort": "medium", "setup_time_days": 30}'),
  ('crous', 'solution', 'CROUS Restaurant', '{"savings_pct": 0.50, "effort": "low", "setup_time_days": 0}'),
  ('velo', 'solution', 'Bike/Walk', '{"savings_pct": 0.80, "effort": "medium", "setup_time_days": 7}'),
  ('free_mobile', 'solution', 'Free Mobile 2€', '{"savings_pct": 0.90, "effort": "low", "setup_time_days": 1}'),
  ('batch_cooking', 'solution', 'Batch Cooking', '{"savings_pct": 0.30, "effort": "high", "setup_time_days": 0}'),
  ('student_discounts', 'solution', 'Student Discounts', '{"savings_pct": 0.20, "effort": "low", "setup_time_days": 0}');

-- ============================================
-- EDGES: Relations between nodes
-- ============================================
CREATE TABLE student_edges (
  source_id VARCHAR,
  target_id VARCHAR,
  relation_type VARCHAR,  -- 'enables', 'pays', 'leads_to', 'reduces', 'requires'
  weight FLOAT,           -- Strength of relation (0-1 or rate)
  properties JSON
);

-- Skills → Jobs (enables)
INSERT INTO student_edges VALUES
  ('python', 'freelance_dev', 'enables', 0.9, '{"co_benefit": "CV++", "experience_type": "professional"}'),
  ('python', 'data_entry', 'enables', 0.6, '{"co_benefit": "automation", "experience_type": "technical"}'),
  ('sql', 'data_entry', 'enables', 0.8, '{"co_benefit": null, "experience_type": "technical"}'),
  ('python', 'tutoring', 'enables', 0.7, '{"co_benefit": "reinforces_learning", "experience_type": "teaching"}'),
  ('excel', 'data_entry', 'enables', 0.9, '{"co_benefit": null, "experience_type": "technical"}'),
  ('english', 'translation', 'enables', 0.85, '{"co_benefit": "language_practice", "experience_type": "linguistic"}'),
  ('french', 'tutoring', 'enables', 0.8, '{"co_benefit": "communication_skills", "experience_type": "teaching"}'),
  ('js', 'freelance_dev', 'enables', 0.85, '{"co_benefit": "CV++", "experience_type": "professional"}');

-- Jobs without skill requirements (anyone can do)
INSERT INTO student_edges VALUES
  ('mcdo', 'mcdo', 'self_available', 1.0, '{"co_benefit": null, "experience_type": "generic"}'),
  ('retail', 'retail', 'self_available', 1.0, '{"co_benefit": "customer_service", "experience_type": "generic"}'),
  ('babysitting', 'babysitting', 'self_available', 1.0, '{"co_benefit": "responsibility", "experience_type": "generic"}');

-- Diplomas → Careers (leads_to)
INSERT INTO student_edges VALUES
  ('l3_info', 'dev_junior', 'leads_to', 0.7, '{"years_after": 0, "typical_path": true}'),
  ('master_dev', 'dev_junior', 'leads_to', 0.9, '{"years_after": 0, "typical_path": true}'),
  ('master_dev', 'dev_senior', 'leads_to', 0.6, '{"years_after": 3, "typical_path": true}'),
  ('master_dev', 'tech_lead', 'leads_to', 0.4, '{"years_after": 7, "typical_path": false}'),
  ('master_data', 'data_analyst', 'leads_to', 0.85, '{"years_after": 0, "typical_path": true}'),
  ('master_data', 'data_scientist', 'leads_to', 0.7, '{"years_after": 2, "typical_path": true}'),
  ('l3_info', 'data_analyst', 'leads_to', 0.5, '{"years_after": 1, "typical_path": false}');

-- Diploma progression
INSERT INTO student_edges VALUES
  ('l1_info', 'l2_info', 'leads_to', 0.85, '{"years_after": 1}'),
  ('l2_info', 'l3_info', 'leads_to', 0.80, '{"years_after": 1}'),
  ('l3_info', 'master_dev', 'leads_to', 0.70, '{"years_after": 2}'),
  ('l3_info', 'master_data', 'leads_to', 0.65, '{"years_after": 2}');

-- Solutions → Expenses (reduces)
INSERT INTO student_edges VALUES
  ('coloc', 'rent', 'reduces', 0.30, '{"condition": "good_roommate", "reversible": true}'),
  ('crous', 'food', 'reduces', 0.50, '{"condition": "proximity", "reversible": true}'),
  ('batch_cooking', 'food', 'reduces', 0.30, '{"condition": "time_available", "reversible": true}'),
  ('velo', 'transport', 'reduces', 0.80, '{"condition": "flat_city", "reversible": true}'),
  ('free_mobile', 'phone', 'reduces', 0.90, '{"condition": "none", "reversible": true}'),
  ('student_discounts', 'leisure', 'reduces', 0.20, '{"condition": "student_card", "reversible": true}');

-- ============================================
-- GRAPH PROPERTY GRAPH (DuckPGQ)
-- ============================================
CREATE PROPERTY GRAPH student_graph
VERTEX TABLES (
  student_nodes
)
EDGE TABLES (
  student_edges
    SOURCE KEY (source_id) REFERENCES student_nodes (id)
    DESTINATION KEY (target_id) REFERENCES student_nodes (id)
    LABEL relation_type
);

-- ============================================
-- USEFUL QUERIES
-- ============================================

-- 1. Find jobs enabled by a skill, sorted by hourly rate
-- SELECT j.name, e.weight as match_score,
--        json_extract(j.properties, '$.hourly_rate') as rate,
--        json_extract(e.properties, '$.co_benefit') as bonus
-- FROM student_edges e
-- JOIN student_nodes s ON e.source_id = s.id
-- JOIN student_nodes j ON e.target_id = j.id
-- WHERE s.id = 'python'
-- AND e.relation_type = 'enables'
-- ORDER BY CAST(json_extract(j.properties, '$.hourly_rate') AS FLOAT) * e.weight DESC;

-- 2. Find budget optimizations
-- SELECT exp.name as expense, sol.name as solution,
--        e.weight * 100 as savings_pct,
--        json_extract(exp.properties, '$.avg_student') as monthly_cost
-- FROM student_edges e
-- JOIN student_nodes sol ON e.source_id = sol.id
-- JOIN student_nodes exp ON e.target_id = exp.id
-- WHERE e.relation_type = 'reduces'
-- ORDER BY e.weight DESC;

-- 3. Career projection from diploma
-- SELECT d.name as diploma, c.name as career,
--        json_extract(c.properties, '$.starting_salary') as salary,
--        json_extract(e.properties, '$.years_after') as years_to_reach
-- FROM student_edges e
-- JOIN student_nodes d ON e.source_id = d.id
-- JOIN student_nodes c ON e.target_id = c.id
-- WHERE d.id = 'master_dev'
-- AND e.relation_type = 'leads_to';
