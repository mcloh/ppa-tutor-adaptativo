CREATE TABLE `billing_orders` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`productKey` varchar(48) NOT NULL,
	`status` enum('draft','pending','paid','failed','cancelled','expired') NOT NULL DEFAULT 'draft',
	`amountCents` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'BRL',
	`creditQuantity` int NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'pagbank',
	`referenceId` varchar(96) NOT NULL,
	`idempotencyKey` varchar(96) NOT NULL,
	`checkoutUrl` varchar(2048),
	`metadataJson` longtext,
	`expiresAt` timestamp,
	`paidAt` timestamp,
	`cancelledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `billing_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_reference_unique` UNIQUE(`referenceId`),
	CONSTRAINT `orders_user_idem_unique` UNIQUE(`userId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `credit_balances` (
	`userId` int NOT NULL,
	`availableCredits` int NOT NULL DEFAULT 0,
	`lifetimeGranted` int NOT NULL DEFAULT 0,
	`lifetimeConsumed` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `credit_balances_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `credit_ledger` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`entryType` enum('trial_grant','purchase_grant','question_debit','adjustment_grant','adjustment_debit','refund_debit') NOT NULL,
	`deltaCredits` int NOT NULL,
	`balanceAfter` int NOT NULL,
	`referenceType` varchar(32) NOT NULL,
	`referenceId` varchar(96) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`metadataJson` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credit_ledger_id` PRIMARY KEY(`id`),
	CONSTRAINT `ledger_user_ref_unique` UNIQUE(`userId`,`referenceType`,`referenceId`),
	CONSTRAINT `ledger_idem_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `payment_attempts` (
	`id` varchar(64) NOT NULL,
	`orderId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'pagbank',
	`status` enum('created','waiting','in_analysis','paid','declined','canceled','failed','expired') NOT NULL DEFAULT 'created',
	`externalPaymentId` varchar(160),
	`externalReference` varchar(160),
	`idempotencyKey` varchar(96) NOT NULL,
	`requestPayloadHash` varchar(64),
	`responsePayloadHash` varchar(64),
	`failureCode` varchar(96),
	`failureDetail` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `pay_attempt_idem_unique` UNIQUE(`idempotencyKey`),
	CONSTRAINT `pay_attempt_external_unique` UNIQUE(`provider`,`externalPaymentId`)
);
--> statement-breakpoint
CREATE TABLE `payment_webhook_events` (
	`id` varchar(64) NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'pagbank',
	`dedupeKey` varchar(160) NOT NULL,
	`externalEventId` varchar(160),
	`externalPaymentId` varchar(160),
	`orderId` varchar(64),
	`payloadHash` varchar(64) NOT NULL,
	`signatureHash` varchar(64),
	`processingStatus` enum('received','processed','ignored','rejected','failed') NOT NULL DEFAULT 'received',
	`occurredAt` timestamp,
	`processedAt` timestamp,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `webhook_dedupe_unique` UNIQUE(`provider`,`dedupeKey`)
);
--> statement-breakpoint
ALTER TABLE `billing_orders` ADD CONSTRAINT `order_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `credit_balances` ADD CONSTRAINT `credit_balances_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `credit_ledger` ADD CONSTRAINT `ledger_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_attempts` ADD CONSTRAINT `attempt_order_fk` FOREIGN KEY (`orderId`) REFERENCES `billing_orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_attempts` ADD CONSTRAINT `attempt_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_webhook_events` ADD CONSTRAINT `webhook_order_fk` FOREIGN KEY (`orderId`) REFERENCES `billing_orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `orders_user_status_idx` ON `billing_orders` (`userId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ledger_user_created_idx` ON `credit_ledger` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pay_attempt_order_idx` ON `payment_attempts` (`orderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `pay_attempt_user_idx` ON `payment_attempts` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `webhook_payment_idx` ON `payment_webhook_events` (`provider`,`externalPaymentId`,`receivedAt`);--> statement-breakpoint
CREATE INDEX `webhook_order_idx` ON `payment_webhook_events` (`orderId`,`receivedAt`);