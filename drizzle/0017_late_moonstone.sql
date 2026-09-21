CREATE TABLE `anac_exam_attempts` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`examDate` date NOT NULL,
	`metScore` int NOT NULL,
	`regScore` int NOT NULL,
	`navScore` int NOT NULL,
	`mecScore` int NOT NULL,
	`tvoScore` int NOT NULL,
	`approved` boolean NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `anac_exam_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `student_profiles` (
	`userId` int NOT NULL,
	`dateOfBirth` date,
	`gender` enum('M','F','NB'),
	`city` varchar(120),
	`stateUf` varchar(2),
	`theoreticalCourseProvider` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `student_profiles_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
ALTER TABLE `anac_exam_attempts` ADD CONSTRAINT `anac_exam_attempts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_profiles` ADD CONSTRAINT `student_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `anac_attempts_user_exam_date_idx` ON `anac_exam_attempts` (`userId`,`examDate`);