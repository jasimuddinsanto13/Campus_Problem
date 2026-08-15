-- ============================================================================
-- CAMPUS PROBLEM — DATABASE SECTION 3 OF 3 : ROOMS (room booking & routines)
-- ============================================================================
-- Everything about classrooms and how they are used: the rooms themselves,
-- the recurring weekly class routines that occupy them, and the one-off room
-- bookings that lock them for exams / makeups / extra classes.
--
-- Table list
--   booking_room                 bookable classrooms (number, building, capacity)
--   booking_routine              recurring weekly classes occupying a room
--   booking_roombooking          one-off room locks (exam / reschedule / extra)
--
-- Owner: Django migrations (backend/booking).
-- Regenerate with:
--   mysqldump -u root --no-data --skip-comments campus_problem \
--     booking_room booking_routine booking_roombooking \
--     > database/rooms/schema.sql
-- ============================================================================

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `booking_room`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `booking_room` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `room_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `building` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `capacity` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `room_number` (`room_number`),
  CONSTRAINT `booking_room_chk_1` CHECK ((`capacity` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `booking_routine`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `booking_routine` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `subject` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `section` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `day` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_time` time(6) NOT NULL,
  `end_time` time(6) NOT NULL,
  `room_id` bigint NOT NULL,
  `teacher_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `booking_routine_room_id_905cf21f_fk_booking_room_id` (`room_id`),
  KEY `booking_routine_teacher_id_c952fdc2_fk_booking_user_id` (`teacher_id`),
  CONSTRAINT `booking_routine_room_id_905cf21f_fk_booking_room_id` FOREIGN KEY (`room_id`) REFERENCES `booking_room` (`id`),
  CONSTRAINT `booking_routine_teacher_id_c952fdc2_fk_booking_user_id` FOREIGN KEY (`teacher_id`) REFERENCES `booking_user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `booking_roombooking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `booking_roombooking` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `booking_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch_section` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `start_time` time(6) NOT NULL,
  `end_time` time(6) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `booked_by_id` bigint NOT NULL,
  `room_id` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `booking_roombooking_booked_by_id_6dc4d85f_fk_booking_user_id` (`booked_by_id`),
  KEY `booking_roombooking_room_id_2ae5e3ec_fk_booking_room_id` (`room_id`),
  CONSTRAINT `booking_roombooking_booked_by_id_6dc4d85f_fk_booking_user_id` FOREIGN KEY (`booked_by_id`) REFERENCES `booking_user` (`id`),
  CONSTRAINT `booking_roombooking_room_id_2ae5e3ec_fk_booking_room_id` FOREIGN KEY (`room_id`) REFERENCES `booking_room` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

