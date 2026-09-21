CREATE TABLE `auth_password_deliveries` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`purpose` enum('activation','password_reset') NOT NULL,
	`recipientHash` varchar(64) NOT NULL,
	`status` enum('issued','sent','failed') NOT NULL DEFAULT 'issued',
	`expiresAt` timestamp NOT NULL,
	`dispatchedAt` timestamp,
	`failureCode` varchar(48),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_password_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `passwordChangeRequired` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `temporaryPasswordIssuedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `temporaryPasswordExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `auth_password_deliveries` ADD CONSTRAINT `auth_password_deliveries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_password_delivery_user_created_idx` ON `auth_password_deliveries` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `auth_password_delivery_status_idx` ON `auth_password_deliveries` (`status`,`expiresAt`);