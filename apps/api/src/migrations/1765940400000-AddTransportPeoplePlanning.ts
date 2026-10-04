import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddTransportPeoplePlanning1765940400000 implements MigrationInterface {
  readonly name = "AddTransportPeoplePlanning1765940400000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transport_plans (
        tour_session_id varchar(64) NOT NULL,
        version int unsigned NOT NULL DEFAULT 1,
        current_confirmation_id varchar(64) NULL,
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (tour_session_id),
        KEY idx_transport_plans_current_confirmation (current_confirmation_id),
        CONSTRAINT fk_transport_plans_tour_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE transport_person_allocations (
        id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        vehicle_id varchar(64) NOT NULL,
        person_ref varchar(128) NOT NULL,
        dedupe_key varchar(191) NOT NULL,
        created_by varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_transport_person_allocations_session_dedupe (tour_session_id, dedupe_key),
        KEY idx_transport_person_allocations_vehicle (vehicle_id),
        CONSTRAINT fk_transport_person_allocations_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_transport_person_allocations_vehicle FOREIGN KEY (vehicle_id) REFERENCES transport_session_vehicles(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE transport_confirmations (
        id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        plan_version int unsigned NOT NULL,
        roster_version varchar(128) NOT NULL,
        snapshot_json json NOT NULL,
        confirmed_by varchar(64) NOT NULL,
        confirmed_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_transport_confirmations_session (tour_session_id),
        CONSTRAINT fk_transport_confirmations_tour_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      ALTER TABLE transport_plans
        ADD CONSTRAINT fk_transport_plans_current_confirmation
        FOREIGN KEY (current_confirmation_id) REFERENCES transport_confirmations(id)
        ON DELETE SET NULL ON UPDATE CASCADE
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE transport_plans DROP FOREIGN KEY fk_transport_plans_current_confirmation")
    await queryRunner.query("DROP TABLE transport_confirmations")
    await queryRunner.query("DROP TABLE transport_person_allocations")
    await queryRunner.query("DROP TABLE transport_plans")
  }
}
