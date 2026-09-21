CREATE TABLE `homologation_audit_events` (
	`id` varchar(64) NOT NULL,
	`actorUserId` int NOT NULL,
	`orderId` varchar(64),
	`provider` varchar(32) NOT NULL DEFAULT 'pagbank',
	`operation` enum('checkout_create','order_reconcile','webhook_received') NOT NULL,
	`outcome` enum('started','succeeded','failed','ignored') NOT NULL,
	`requestEvidenceJson` longtext NOT NULL,
	`responseEvidenceJson` longtext NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`responseHash` varchar(64) NOT NULL,
	`exportedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `homologation_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `homologation_audit_events` ADD CONSTRAINT `homologation_audit_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `homologation_audit_events` ADD CONSTRAINT `homologation_audit_events_orderId_billing_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `billing_orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `homologation_audit_actor_created_idx` ON `homologation_audit_events` (`actorUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `homologation_audit_order_created_idx` ON `homologation_audit_events` (`orderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `homologation_audit_provider_operation_idx` ON `homologation_audit_events` (`provider`,`operation`,`createdAt`);