ALTER TABLE `student_concept_readiness` ADD COLUMN `reviewEligibleAfterQuestion` int NOT NULL DEFAULT 0 AFTER `reviewDueAt`;
--> statement-breakpoint
ALTER TABLE `study_questions` ADD COLUMN `feedbackMarkdown` longtext AFTER `validationJson`;
