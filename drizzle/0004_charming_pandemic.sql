CREATE TABLE `knowledge_chunk_terms` (
	`id` varchar(64) NOT NULL,
	`sourceId` varchar(64) NOT NULL,
	`chunkId` varchar(64) NOT NULL,
	`token` varchar(64) NOT NULL,
	`weight` int NOT NULL DEFAULT 1,
	CONSTRAINT `knowledge_chunk_terms_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_terms_chunk_token_unique` UNIQUE(`chunkId`,`token`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` varchar(64) NOT NULL,
	`sourceId` varchar(64) NOT NULL,
	`module` varchar(120) NOT NULL,
	`sourcePath` varchar(512) NOT NULL,
	`ordinal` int NOT NULL,
	`contentChecksum` varchar(64) NOT NULL,
	`content` longtext NOT NULL,
	`charCount` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `knowledge_chunks_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_chunks_source_path_unique` UNIQUE(`sourceId`,`sourcePath`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_sources` (
	`id` varchar(64) NOT NULL,
	`catalogVersionId` varchar(64) NOT NULL,
	`logicalName` varchar(160) NOT NULL,
	`originalFilename` varchar(255) NOT NULL,
	`sourceChecksum` varchar(64) NOT NULL,
	`extractionChecksum` varchar(64) NOT NULL,
	`extractionVersion` varchar(32) NOT NULL,
	`status` enum('indexing','ready','failed') NOT NULL DEFAULT 'indexing',
	`chunkCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`indexedAt` timestamp,
	CONSTRAINT `knowledge_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_source_version_unique` UNIQUE(`catalogVersionId`,`sourceChecksum`)
);
--> statement-breakpoint
ALTER TABLE `knowledge_chunk_terms` ADD CONSTRAINT `knowledge_term_source_fk` FOREIGN KEY (`sourceId`) REFERENCES `knowledge_sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledge_chunk_terms` ADD CONSTRAINT `knowledge_term_chunk_fk` FOREIGN KEY (`chunkId`) REFERENCES `knowledge_chunks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledge_chunks` ADD CONSTRAINT `knowledge_chunk_source_fk` FOREIGN KEY (`sourceId`) REFERENCES `knowledge_sources`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledge_sources` ADD CONSTRAINT `knowledge_source_catalog_fk` FOREIGN KEY (`catalogVersionId`) REFERENCES `course_catalog_versions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `knowledge_terms_source_token_idx` ON `knowledge_chunk_terms` (`sourceId`,`token`);--> statement-breakpoint
CREATE INDEX `knowledge_chunks_source_module_idx` ON `knowledge_chunks` (`sourceId`,`module`,`ordinal`);
