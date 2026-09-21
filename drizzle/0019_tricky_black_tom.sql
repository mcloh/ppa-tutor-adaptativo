DROP INDEX `homologation_audit_provider_operation_idx` ON `homologation_audit_events`;--> statement-breakpoint
ALTER TABLE `billing_orders` ADD `environment` enum('sandbox','production') DEFAULT 'sandbox' NOT NULL;--> statement-breakpoint
ALTER TABLE `homologation_audit_events` ADD `environment` enum('sandbox','production') DEFAULT 'sandbox' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_attempts` ADD `environment` enum('sandbox','production') DEFAULT 'sandbox' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_webhook_events` ADD `environment` enum('sandbox','production') DEFAULT 'sandbox' NOT NULL;--> statement-breakpoint
CREATE INDEX `orders_environment_status_idx` ON `billing_orders` (`environment`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `homologation_audit_provider_operation_idx` ON `homologation_audit_events` (`provider`,`environment`,`operation`,`createdAt`);