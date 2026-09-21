ALTER TABLE `auth_password_deliveries` ADD `smtpAcceptedAt` timestamp;--> statement-breakpoint
ALTER TABLE `auth_password_deliveries` ADD `smtpMessageIdHash` varchar(64);