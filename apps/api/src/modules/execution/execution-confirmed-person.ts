import { ConflictException, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { readTransportConfirmation } from "../transport/transport-confirmation.read.js"
import type { PersonRef } from "../travelers/travelers.types.js"

export async function readConfirmedPerson(manager: EntityManager, target: { readonly sessionId: string; readonly personRef: PersonRef }) {
  const confirmation = await readTransportConfirmation(manager, target.sessionId)
  if (confirmation.status !== "current") throw new ConflictException({ code: "execution_transport_confirmation_required", message: "人车名单尚未有效确认，请先重新确认分车方案" })
  const person = confirmation.snapshot.assignments.find(row => row.personRef === target.personRef)
  if (person === undefined) throw new NotFoundException({ code: "execution_confirmed_person_not_found", message: "当前确认名单中没有此人员" })
  return person
}
