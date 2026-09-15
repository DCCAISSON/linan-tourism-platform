import { ref, watch } from "vue"

import {
  type ClassPayload,
  type Grade,
  type GradePayload,
  type School,
  type SchoolClass,
  type SchoolPayload,
  createClass,
  createGrade,
  createSchool,
  deleteClass,
  deleteGrade,
  deleteSchool,
  listClasses,
  listGrades,
  listSchools,
  readableApiError,
} from "@/api/configuration"

export function useSchoolStructure() {
  const schools = ref<readonly School[]>([])
  const grades = ref<readonly Grade[]>([])
  const classes = ref<readonly SchoolClass[]>([])
  const selectedSchoolId = ref("")
  const selectedGradeId = ref("")
  const schoolLoading = ref(false)
  const gradeLoading = ref(false)
  const classLoading = ref(false)
  const schoolSubmitting = ref(false)
  const gradeSubmitting = ref(false)
  const classSubmitting = ref(false)
  const schoolError = ref("")
  const gradeError = ref("")
  const classError = ref("")
  const schoolFormError = ref("")
  const gradeFormError = ref("")
  const classFormError = ref("")
  const gradeRequestVersion = ref(0)
  const classRequestVersion = ref(0)

  watch(selectedSchoolId, schoolId => {
    void loadGradesForSchool(schoolId)
  })

  watch(selectedGradeId, gradeId => {
    void loadClassesForGrade(gradeId)
  })

  function selectSchool(schoolId: string): void {
    selectedSchoolId.value = schoolId
  }

  function selectGrade(gradeId: string): void {
    selectedGradeId.value = gradeId
  }

  async function loadSchoolList(): Promise<void> {
    schoolLoading.value = true
    schoolError.value = ""
    try {
      schools.value = await listSchools()
      selectedSchoolId.value = schools.value.at(0)?.id ?? ""
    } catch (error) {
      schoolError.value = readableApiError(error)
    } finally {
      schoolLoading.value = false
    }
  }

  async function loadGradesForSchool(schoolId: string): Promise<void> {
    gradeRequestVersion.value += 1
    const requestVersion = gradeRequestVersion.value
    grades.value = []
    selectedGradeId.value = ""
    if (schoolId === "") {
      return
    }
    gradeLoading.value = true
    gradeError.value = ""
    try {
      const nextGrades = await listGrades(schoolId)
      if (requestVersion === gradeRequestVersion.value) {
        grades.value = nextGrades
        selectedGradeId.value = nextGrades.at(0)?.id ?? ""
      }
    } catch (error) {
      if (requestVersion === gradeRequestVersion.value) {
        gradeError.value = readableApiError(error)
      }
    } finally {
      if (requestVersion === gradeRequestVersion.value) {
        gradeLoading.value = false
      }
    }
  }

  async function loadClassesForGrade(gradeId: string): Promise<void> {
    classRequestVersion.value += 1
    const requestVersion = classRequestVersion.value
    classes.value = []
    if (gradeId === "") {
      return
    }
    classLoading.value = true
    classError.value = ""
    try {
      const nextClasses = await listClasses(gradeId)
      if (requestVersion === classRequestVersion.value) {
        classes.value = nextClasses
      }
    } catch (error) {
      if (requestVersion === classRequestVersion.value) {
        classError.value = readableApiError(error)
      }
    } finally {
      if (requestVersion === classRequestVersion.value) {
        classLoading.value = false
      }
    }
  }

  async function submitSchool(payload: SchoolPayload): Promise<void> {
    schoolSubmitting.value = true
    schoolFormError.value = ""
    try {
      const school = await createSchool(payload)
      schools.value = [...schools.value, school]
      selectedSchoolId.value = school.id
    } catch (error) {
      schoolFormError.value = readableApiError(error)
    } finally {
      schoolSubmitting.value = false
    }
  }

  async function submitGrade(payload: GradePayload): Promise<void> {
    gradeSubmitting.value = true
    gradeFormError.value = ""
    try {
      const grade = await createGrade(selectedSchoolId.value, payload)
      grades.value = [...grades.value, grade]
      selectedGradeId.value = grade.id
    } catch (error) {
      gradeFormError.value = readableApiError(error)
    } finally {
      gradeSubmitting.value = false
    }
  }

  async function submitClass(payload: ClassPayload): Promise<void> {
    classSubmitting.value = true
    classFormError.value = ""
    try {
      classes.value = [...classes.value, await createClass(selectedGradeId.value, payload)]
    } catch (error) {
      classFormError.value = readableApiError(error)
    } finally {
      classSubmitting.value = false
    }
  }

  async function removeSchool(id: string): Promise<void> {
    schoolSubmitting.value = true
    schoolFormError.value = ""
    try {
      await deleteSchool(id)
      schools.value = schools.value.filter(school => school.id !== id)
      selectedSchoolId.value = selectedSchoolId.value === id ? schools.value.at(0)?.id ?? "" : selectedSchoolId.value
    } catch (error) {
      schoolFormError.value = readableApiError(error)
    } finally {
      schoolSubmitting.value = false
    }
  }

  async function removeGrade(id: string): Promise<void> {
    gradeSubmitting.value = true
    gradeFormError.value = ""
    try {
      await deleteGrade(id)
      grades.value = grades.value.filter(grade => grade.id !== id)
      selectedGradeId.value = selectedGradeId.value === id ? grades.value.at(0)?.id ?? "" : selectedGradeId.value
    } catch (error) {
      gradeFormError.value = readableApiError(error)
    } finally {
      gradeSubmitting.value = false
    }
  }

  async function removeClass(id: string): Promise<void> {
    classSubmitting.value = true
    classFormError.value = ""
    try {
      await deleteClass(id)
      classes.value = classes.value.filter(schoolClass => schoolClass.id !== id)
    } catch (error) {
      classFormError.value = readableApiError(error)
    } finally {
      classSubmitting.value = false
    }
  }

  return {
    classError,
    classFormError,
    classLoading,
    classSubmitting,
    classes,
    gradeError,
    gradeFormError,
    gradeLoading,
    gradeSubmitting,
    grades,
    loadSchoolList,
    removeClass,
    removeGrade,
    removeSchool,
    schoolError,
    schoolFormError,
    schoolLoading,
    schoolSubmitting,
    schools,
    selectGrade,
    selectSchool,
    selectedGradeId,
    selectedSchoolId,
    submitClass,
    submitGrade,
    submitSchool,
  }
}
