CREATE TABLE `auth_login_attempts` (
	`id` varchar(64) NOT NULL,
	`emailHash` varchar(64) NOT NULL,
	`ipHash` varchar(64) NOT NULL,
	`succeeded` boolean NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_login_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_sessions_token_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE TABLE `canonical_concepts` (
	`id` varchar(48) NOT NULL,
	`catalogVersionId` varchar(64) NOT NULL,
	`canonicalIndex` int NOT NULL,
	`matterId` varchar(20) NOT NULL,
	`matterName` varchar(180) NOT NULL,
	`chapterId` varchar(24) NOT NULL,
	`chapterName` varchar(180) NOT NULL,
	`topicId` varchar(32) NOT NULL,
	`topicName` varchar(180) NOT NULL,
	`name` varchar(255) NOT NULL,
	`priority` enum('P1','P2','P3','P4') NOT NULL,
	`gapScore` int NOT NULL,
	`referenceQuestionCount` int NOT NULL DEFAULT 0,
	`recentIncidence` varchar(32) NOT NULL DEFAULT 'none',
	CONSTRAINT `canonical_concepts_id` PRIMARY KEY(`id`),
	CONSTRAINT `canonical_concepts_catalog_index_unique` UNIQUE(`catalogVersionId`,`canonicalIndex`)
);
--> statement-breakpoint
CREATE TABLE `course_catalog_versions` (
	`id` varchar(64) NOT NULL,
	`version` varchar(32) NOT NULL,
	`sourceChecksum` varchar(64) NOT NULL,
	`sourceMapJson` longtext NOT NULL,
	`sourcePlanMarkdown` longtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `course_catalog_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_catalog_versions_version_unique` UNIQUE(`version`)
);
--> statement-breakpoint
CREATE TABLE `in_app_notifications` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('review_due','assessment_ready','integrity_attention') NOT NULL,
	`title` varchar(160) NOT NULL,
	`detail` longtext NOT NULL,
	`referenceType` varchar(48),
	`referenceId` varchar(64),
	`dedupeKey` varchar(128) NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `in_app_notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `notifications_user_dedupe_unique` UNIQUE(`userId`,`dedupeKey`)
);
--> statement-breakpoint
CREATE TABLE `learning_events` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`questionId` varchar(64) NOT NULL,
	`mapVersion` int NOT NULL,
	`eventType` enum('independent_correct','independent_incorrect','teach_requested','immediate_review_correct','immediate_review_incorrect','spaced_review_correct','spaced_review_incorrect') NOT NULL,
	`classification` enum('correct','incorrect','me_ensine') NOT NULL,
	`answer` varchar(24) NOT NULL,
	`correctAnswer` varchar(1) NOT NULL,
	`conceptIdsJson` longtext NOT NULL,
	`source` varchar(32) NOT NULL DEFAULT 'tutor',
	`auditNote` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `learning_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `learning_events_question_unique` UNIQUE(`questionId`)
);
--> statement-breakpoint
CREATE TABLE `progress_assessments` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`assessmentType` enum('partial_20','diagnostic_100') NOT NULL,
	`startQuestionNumber` int NOT NULL,
	`endQuestionNumber` int NOT NULL,
	`mapVersion` int NOT NULL,
	`contentMarkdown` longtext NOT NULL,
	`auditReference` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `progress_assessments_id` PRIMARY KEY(`id`),
	CONSTRAINT `assessments_user_end_question_unique` UNIQUE(`userId`,`endQuestionNumber`)
);
--> statement-breakpoint
CREATE TABLE `readiness_map_versions` (
	`id` varchar(64) NOT NULL,
	`mapId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`version` int NOT NULL,
	`eventId` varchar(64) NOT NULL,
	`patchJson` longtext NOT NULL,
	`snapshotJson` longtext,
	`checksum` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `readiness_map_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `readiness_versions_map_version_unique` UNIQUE(`mapId`,`version`),
	CONSTRAINT `readiness_versions_event_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `student_concept_readiness` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`conceptId` varchar(48) NOT NULL,
	`currentState` enum('not_presented','presented','taught','independent_correct','partial_consolidation','partial_adequate','partial_strong','partial_confirmed','confirmed','relearning') NOT NULL DEFAULT 'not_presented',
	`readinessScore` int NOT NULL DEFAULT 0,
	`confidence` int NOT NULL DEFAULT 0,
	`questionsPresented` int NOT NULL DEFAULT 0,
	`independentAnswers` int NOT NULL DEFAULT 0,
	`correct` int NOT NULL DEFAULT 0,
	`incorrect` int NOT NULL DEFAULT 0,
	`teachRequests` int NOT NULL DEFAULT 0,
	`immediateReviewQuestions` int NOT NULL DEFAULT 0,
	`immediateCorrect` int NOT NULL DEFAULT 0,
	`immediateIncorrect` int NOT NULL DEFAULT 0,
	`spacedReviewQuestions` int NOT NULL DEFAULT 0,
	`spacedCorrect` int NOT NULL DEFAULT 0,
	`spacedIncorrect` int NOT NULL DEFAULT 0,
	`firstPresentedAt` timestamp,
	`lastPresentedAt` timestamp,
	`lastIndependentAnswerAt` timestamp,
	`lastTeachAt` timestamp,
	`lastReviewAt` timestamp,
	`reviewDueAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_concept_readiness_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_concept_readiness_user_concept_unique` UNIQUE(`userId`,`conceptId`)
);
--> statement-breakpoint
CREATE TABLE `student_readiness_maps` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`catalogVersionId` varchar(64) NOT NULL,
	`currentVersion` int NOT NULL DEFAULT 0,
	`mapJson` longtext NOT NULL,
	`checksum` varchar(64) NOT NULL,
	`integrityStatus` enum('valid','recoverable','blocked') NOT NULL DEFAULT 'valid',
	`lastEventId` varchar(64),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_readiness_maps_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_maps_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `study_plans` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`version` int NOT NULL,
	`sourceMapVersion` int NOT NULL,
	`contentMarkdown` longtext NOT NULL,
	`auditReference` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `study_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `study_plans_user_version_unique` UNIQUE(`userId`,`version`)
);
--> statement-breakpoint
CREATE TABLE `study_questions` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`questionNumber` int NOT NULL,
	`prompt` longtext NOT NULL,
	`optionA` longtext NOT NULL,
	`optionB` longtext NOT NULL,
	`optionC` longtext NOT NULL,
	`correctOption` enum('A','B','C') NOT NULL,
	`conceptIdsJson` longtext NOT NULL,
	`pedagogicalAction` enum('new','immediate_review','spaced_review') NOT NULL,
	`validationJson` longtext NOT NULL,
	`status` enum('presented','answered','retired') NOT NULL DEFAULT 'presented',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`answeredAt` timestamp,
	CONSTRAINT `study_questions_id` PRIMARY KEY(`id`),
	CONSTRAINT `study_questions_session_number_unique` UNIQUE(`sessionId`,`questionNumber`)
);
--> statement-breakpoint
CREATE TABLE `study_sessions` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`status` enum('active','paused','completed') NOT NULL DEFAULT 'active',
	`currentQuestionId` varchar(64),
	`lastMatterId` varchar(20),
	`consecutiveMatterQuestions` int NOT NULL DEFAULT 0,
	`questionsSinceLastReview` int NOT NULL DEFAULT 0,
	`resumedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `study_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(120) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `email` varchar(320) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `loginMethod` varchar(64) NOT NULL DEFAULT 'password';--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `canonical_concepts` ADD CONSTRAINT `canonical_catalog_fk` FOREIGN KEY (`catalogVersionId`) REFERENCES `course_catalog_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `in_app_notifications` ADD CONSTRAINT `in_app_notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learning_events` ADD CONSTRAINT `learning_events_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learning_events` ADD CONSTRAINT `learning_events_questionId_study_questions_id_fk` FOREIGN KEY (`questionId`) REFERENCES `study_questions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `progress_assessments` ADD CONSTRAINT `progress_assessments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `readiness_map_versions` ADD CONSTRAINT `readiness_map_versions_mapId_student_readiness_maps_id_fk` FOREIGN KEY (`mapId`) REFERENCES `student_readiness_maps`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `readiness_map_versions` ADD CONSTRAINT `readiness_map_versions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_concept_readiness` ADD CONSTRAINT `student_concept_readiness_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_concept_readiness` ADD CONSTRAINT `readiness_concept_fk` FOREIGN KEY (`conceptId`) REFERENCES `canonical_concepts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_readiness_maps` ADD CONSTRAINT `student_readiness_maps_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_readiness_maps` ADD CONSTRAINT `student_map_catalog_fk` FOREIGN KEY (`catalogVersionId`) REFERENCES `course_catalog_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `study_plans` ADD CONSTRAINT `study_plans_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `study_questions` ADD CONSTRAINT `study_questions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `study_questions` ADD CONSTRAINT `study_questions_sessionId_study_sessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `study_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `study_sessions` ADD CONSTRAINT `study_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_attempts_lookup_idx` ON `auth_login_attempts` (`emailHash`,`createdAt`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_active_idx` ON `auth_sessions` (`userId`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `canonical_concepts_priority_idx` ON `canonical_concepts` (`catalogVersionId`,`priority`,`matterId`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_idx` ON `in_app_notifications` (`userId`,`readAt`,`createdAt`);--> statement-breakpoint
CREATE INDEX `learning_events_user_created_idx` ON `learning_events` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `assessments_user_created_idx` ON `progress_assessments` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `readiness_versions_user_idx` ON `readiness_map_versions` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `student_concept_due_idx` ON `student_concept_readiness` (`userId`,`reviewDueAt`);--> statement-breakpoint
CREATE INDEX `student_concept_state_idx` ON `student_concept_readiness` (`userId`,`currentState`);--> statement-breakpoint
CREATE INDEX `study_questions_user_status_idx` ON `study_questions` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `study_sessions_user_status_idx` ON `study_sessions` (`userId`,`status`);
