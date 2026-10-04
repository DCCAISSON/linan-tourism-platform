import type { MigrationInterface, QueryRunner } from "typeorm"

export class AddTransportPlanning1765929600000 implements MigrationInterface {
  readonly name = "AddTransportPlanning1765929600000"

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE transport_session_vehicles (
        id varchar(64) NOT NULL,
        organization_id varchar(64) NOT NULL,
        tour_session_id varchar(64) NOT NULL,
        sequence int unsigned NOT NULL,
        seat_capacity int unsigned NOT NULL,
        plate_number varchar(64) NULL,
        contact_snapshot_json json NOT NULL,
        created_by varchar(64) NOT NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_transport_session_vehicles_session_sequence (tour_session_id, sequence),
        KEY idx_transport_session_vehicles_organization (organization_id),
        CONSTRAINT fk_transport_session_vehicles_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT fk_transport_session_vehicles_tour_session FOREIGN KEY (tour_session_id) REFERENCES tour_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    await queryRunner.query(`
      CREATE TABLE transport_class_allocations (
        id varchar(64) NOT NULL,
        vehicle_id varchar(64) NOT NULL,
        class_id varchar(64) NOT NULL,
        student_count int unsigned NOT NULL,
        guardian_count int unsigned NOT NULL,
        teacher_count int unsigned NOT NULL,
        other_count int unsigned NOT NULL,
        note varchar(255) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_transport_class_allocations_vehicle (vehicle_id),
        KEY idx_transport_class_allocations_class (class_id),
        CONSTRAINT fk_transport_class_allocations_vehicle FOREIGN KEY (vehicle_id) REFERENCES transport_session_vehicles(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_transport_class_allocations_class FOREIGN KEY (class_id) REFERENCES school_classes(id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE transport_class_allocations")
    await queryRunner.query("DROP TABLE transport_session_vehicles")
  }
}
