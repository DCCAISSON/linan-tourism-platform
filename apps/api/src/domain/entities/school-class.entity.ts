import { Column, CreateDateColumn, Entity, ForeignKey, Index, PrimaryColumn, UpdateDateColumn } from "typeorm"
import { SchoolGradeEntity } from "./school-grade.entity.js"

@Entity({ name: "school_classes" })
@Index("uq_school_classes_grade_code", ["gradeId", "code"], { unique: true })
export class SchoolClassEntity {
  @PrimaryColumn({ type: "varchar", length: 64 })
  id = ""

  @ForeignKey(() => SchoolGradeEntity, {
    name: "fk_school_classes_grade",
    onDelete: "RESTRICT",
    onUpdate: "CASCADE",
  })
  @Column({ name: "grade_id", type: "varchar", length: 64 })
  gradeId = ""

  @Column({ type: "varchar", length: 64 })
  code = ""

  @Column({ type: "varchar", length: 120 })
  name = ""

  @CreateDateColumn({ name: "created_at", type: "datetime", precision: 6 })
  createdAt = new Date(0)

  @UpdateDateColumn({ name: "updated_at", type: "datetime", precision: 6 })
  updatedAt = new Date(0)
}
