CREATE TABLE `shared_question_cache` (
	`id` varchar(64) NOT NULL,
	`catalogVersionId` varchar(64) NOT NULL,
	`conceptId` varchar(48) NOT NULL,
	`ragSourceId` varchar(64) NOT NULL,
	`ragSourceChecksum` varchar(64) NOT NULL,
	`ragChunkIdsJson` longtext NOT NULL,
	`questionSignature` varchar(64) NOT NULL,
	`prompt` longtext NOT NULL,
	`optionA` longtext NOT NULL,
	`optionB` longtext NOT NULL,
	`optionC` longtext NOT NULL,
	`correctOption` enum('A','B','C') NOT NULL,
	`validationJson` longtext NOT NULL,
	`feedbackCorrectMarkdown` longtext,
	`feedbackIncorrectMarkdown` longtext,
	`feedbackTeachMarkdown` longtext,
	`status` enum('approved','retired') NOT NULL DEFAULT 'approved',
	`deliveryCount` int NOT NULL DEFAULT 0,
	`feedbackGenerationCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp,
	CONSTRAINT `shared_question_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `cache_question_signature_unique` UNIQUE(`questionSignature`)
);
--> statement-breakpoint
ALTER TABLE `study_questions` ADD `cacheQuestionId` varchar(64);--> statement-breakpoint
ALTER TABLE `shared_question_cache` ADD CONSTRAINT `cache_catalog_fk` FOREIGN KEY (`catalogVersionId`) REFERENCES `course_catalog_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shared_question_cache` ADD CONSTRAINT `cache_concept_fk` FOREIGN KEY (`conceptId`) REFERENCES `canonical_concepts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shared_question_cache` ADD CONSTRAINT `cache_rag_source_fk` FOREIGN KEY (`ragSourceId`) REFERENCES `knowledge_sources`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cache_question_reuse_idx` ON `shared_question_cache` (`catalogVersionId`,`conceptId`,`ragSourceId`,`status`);--> statement-breakpoint
ALTER TABLE `study_questions` ADD CONSTRAINT `study_question_cache_fk` FOREIGN KEY (`cacheQuestionId`) REFERENCES `shared_question_cache`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `study_questions_user_cache_idx` ON `study_questions` (`userId`,`cacheQuestionId`);