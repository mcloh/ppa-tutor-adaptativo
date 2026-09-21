ALTER TABLE `shared_question_cache` ADD `correctDeliveries` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shared_question_cache` ADD `incorrectDeliveries` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shared_question_cache` ADD `teachDeliveries` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shared_question_cache` ADD `retiredAt` timestamp;--> statement-breakpoint
ALTER TABLE `shared_question_cache` ADD `retiredReason` varchar(500);