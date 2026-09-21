CREATE TABLE `external_health_checks` (
	`id` varchar(64) NOT NULL,
	`checkedAt` timestamp NOT NULL DEFAULT (now()),
	`source` varchar(64) NOT NULL,
	`status` enum('succeeded','failed') NOT NULL,
	`durationMs` int,
	CONSTRAINT `external_health_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `llm_pricing_rules` (
	`id` varchar(64) NOT NULL,
	`provider` varchar(64) NOT NULL,
	`model` varchar(128) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`inputCentsPerMillion` int NOT NULL,
	`outputCentsPerMillion` int NOT NULL,
	`effectiveFrom` timestamp NOT NULL,
	`effectiveTo` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `llm_pricing_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `llm_usage_events` (
	`id` varchar(64) NOT NULL,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`operation` varchar(64) NOT NULL,
	`provider` varchar(64) NOT NULL,
	`model` varchar(128) NOT NULL,
	`status` enum('succeeded','failed') NOT NULL,
	`promptTokens` int,
	`completionTokens` int,
	`totalTokens` int,
	`latencyMs` int,
	`estimatedCostCents` int,
	`pricingRuleId` varchar(64),
	`errorCode` varchar(64),
	CONSTRAINT `llm_usage_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operation_metric_events` (
	`id` varchar(64) NOT NULL,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	`component` varchar(32) NOT NULL,
	`operation` varchar(64) NOT NULL,
	`outcome` enum('succeeded','failed','fallback') NOT NULL,
	`durationMs` int,
	`errorCode` varchar(64),
	`metadataJson` longtext,
	CONSTRAINT `operation_metric_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `operational_cost_entries` (
	`id` varchar(64) NOT NULL,
	`occurredAt` timestamp NOT NULL,
	`category` varchar(48) NOT NULL,
	`provider` varchar(96) NOT NULL,
	`amountCents` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'BRL',
	`source` varchar(64) NOT NULL,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `operational_cost_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_access_sessions` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`activeSeconds` int NOT NULL DEFAULT 0,
	`lastView` varchar(32) NOT NULL,
	CONSTRAINT `platform_access_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `runtime_metric_snapshots` (
	`id` varchar(64) NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	`metricName` varchar(64) NOT NULL,
	`value` int NOT NULL,
	`unit` varchar(16) NOT NULL,
	`source` varchar(64) NOT NULL,
	CONSTRAINT `runtime_metric_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `llm_usage_events` ADD CONSTRAINT `llm_usage_pricing_rule_fk` FOREIGN KEY (`pricingRuleId`) REFERENCES `llm_pricing_rules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_access_sessions` ADD CONSTRAINT `platform_access_sessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `external_health_time_idx` ON `external_health_checks` (`checkedAt`);--> statement-breakpoint
CREATE INDEX `llm_pricing_model_effective_idx` ON `llm_pricing_rules` (`provider`,`model`,`effectiveFrom`);--> statement-breakpoint
CREATE INDEX `llm_usage_time_idx` ON `llm_usage_events` (`occurredAt`);--> statement-breakpoint
CREATE INDEX `llm_usage_operation_time_idx` ON `llm_usage_events` (`operation`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `operation_metrics_time_idx` ON `operation_metric_events` (`occurredAt`);--> statement-breakpoint
CREATE INDEX `operation_metrics_component_time_idx` ON `operation_metric_events` (`component`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `operation_metrics_outcome_time_idx` ON `operation_metric_events` (`outcome`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `operational_cost_time_idx` ON `operational_cost_entries` (`occurredAt`,`category`);--> statement-breakpoint
CREATE INDEX `platform_access_user_last_seen_idx` ON `platform_access_sessions` (`userId`,`lastSeenAt`);--> statement-breakpoint
CREATE INDEX `platform_access_started_idx` ON `platform_access_sessions` (`startedAt`);--> statement-breakpoint
CREATE INDEX `runtime_metric_name_time_idx` ON `runtime_metric_snapshots` (`metricName`,`capturedAt`);