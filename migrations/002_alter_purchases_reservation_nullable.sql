-- Migration: 002_alter_purchases_reservation_nullable
-- Description: Make reservation_id nullable in purchases table

ALTER TABLE purchases ALTER COLUMN reservation_id DROP NOT NULL;
