ALTER TABLE `users` ADD `googleSubject` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_google_subject_unique` UNIQUE(`googleSubject`);