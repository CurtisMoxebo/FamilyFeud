-- CreateTable
CREATE TABLE `answers` (
    `id` VARCHAR(191) NOT NULL,
    `question_id` VARCHAR(191) NOT NULL,
    `rank_order` INTEGER NOT NULL,
    `answer_text` VARCHAR(255) NOT NULL,
    `points` INTEGER NOT NULL,
    `is_revealed` BOOLEAN NOT NULL DEFAULT false,

    INDEX `answers_question_id_rank_order_idx`(`question_id`, `rank_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `games` (
    `id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `mode` ENUM('FAST_MONEY', 'MAIN_GAME') NOT NULL,
    `status` ENUM('IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
    `current_round` INTEGER NOT NULL DEFAULT 1,
    `winner_team` VARCHAR(50) NULL,
    `total_points_accumulated` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `games_room_id_idx`(`room_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `players` (
    `id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(50) NOT NULL,
    `team` ENUM('TEAM_1', 'TEAM_2', 'NONE') NOT NULL DEFAULT 'NONE',
    `socket_id` VARCHAR(100) NULL,
    `is_ready` BOOLEAN NOT NULL DEFAULT false,
    `total_score` INTEGER NOT NULL DEFAULT 0,
    `is_connected` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `players_room_id_is_connected_idx`(`room_id`, `is_connected`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `questions` (
    `id` VARCHAR(191) NOT NULL,
    `game_id` VARCHAR(191) NOT NULL,
    `round_number` INTEGER NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 1,
    `language` VARCHAR(10) NOT NULL,
    `question_text` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `questions_game_id_round_number_order_index_idx`(`game_id`, `round_number`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `player_responses` (
    `id` VARCHAR(191) NOT NULL,
    `question_id` VARCHAR(191) NOT NULL,
    `player_id` VARCHAR(191) NOT NULL,
    `raw_input` VARCHAR(255) NOT NULL,
    `is_matched` BOOLEAN NOT NULL DEFAULT false,
    `matched_answer_id` VARCHAR(191) NULL,
    `points_awarded` INTEGER NOT NULL DEFAULT 0,
    `response_time_seconds` DECIMAL(5, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `player_responses_question_id_idx`(`question_id`),
    INDEX `player_responses_player_id_idx`(`player_id`),
    INDEX `player_responses_matched_answer_id_idx`(`matched_answer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rooms` (
    `id` VARCHAR(191) NOT NULL,
    `room_code` VARCHAR(10) NOT NULL,
    `room_name` VARCHAR(100) NOT NULL,
    `language` ENUM('EN', 'FR', 'ES') NOT NULL DEFAULT 'EN',
    `game_mode` ENUM('FAST_MONEY', 'MAIN_GAME') NOT NULL,
    `status` ENUM('LOBBY', 'ACTIVE', 'FINISHED') NOT NULL DEFAULT 'LOBBY',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `rooms_room_code_key`(`room_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `answers` ADD CONSTRAINT `answers_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `games` ADD CONSTRAINT `games_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `players` ADD CONSTRAINT `players_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `questions` ADD CONSTRAINT `questions_game_id_fkey` FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `player_responses` ADD CONSTRAINT `player_responses_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `player_responses` ADD CONSTRAINT `player_responses_player_id_fkey` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `player_responses` ADD CONSTRAINT `player_responses_matched_answer_id_fkey` FOREIGN KEY (`matched_answer_id`) REFERENCES `answers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

