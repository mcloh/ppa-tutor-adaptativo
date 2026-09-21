CREATE TABLE `student_study_programs` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`catalogVersionId` varchar(64) NOT NULL,
	`diagnosticStatus` enum('active','mode_selection','completed') NOT NULL DEFAULT 'active',
	`selectedMode` enum('simulado','tutor'),
	`diagnosticPlanJson` longtext NOT NULL,
	`diagnosticSessionId` varchar(64),
	`completedAt` timestamp,
	`selectedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_study_programs_id` PRIMARY KEY(`id`),
	CONSTRAINT `study_program_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `study_questions` ADD `studyMode` enum('diagnostic','simulado','tutor') DEFAULT 'tutor' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_questions` ADD `matrixSlot` int;--> statement-breakpoint
ALTER TABLE `study_sessions` ADD `mode` enum('diagnostic','simulado','tutor') DEFAULT 'tutor' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_sessions` ADD `programId` varchar(64);--> statement-breakpoint
ALTER TABLE `study_sessions` ADD `matrixJson` longtext;--> statement-breakpoint
ALTER TABLE `student_study_programs` ADD CONSTRAINT `program_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_study_programs` ADD CONSTRAINT `program_catalog_fk` FOREIGN KEY (`catalogVersionId`) REFERENCES `course_catalog_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `study_program_status_idx` ON `student_study_programs` (`userId`,`diagnosticStatus`);--> statement-breakpoint
CREATE INDEX `study_questions_user_mode_idx` ON `study_questions` (`userId`,`studyMode`,`createdAt`);--> statement-breakpoint
CREATE INDEX `study_sessions_user_mode_idx` ON `study_sessions` (`userId`,`mode`,`status`);