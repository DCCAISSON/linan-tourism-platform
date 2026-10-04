const config = window.__LINAN_SITE_CONFIG__ ?? {}

showContact("contact-phone", config.contactPhone, `tel:${config.contactPhone}`)
showContact("contact-email", config.contactEmail, `mailto:${config.contactEmail}`)
showFiling("filing-icp", config.icpNumber, "https://beian.miit.gov.cn/")
showFiling("filing-public-security", config.publicSecurityNumber, config.publicSecurityUrl)
togglePending("filing-icp-pending", config.icpNumber)
togglePending("filing-public-security-pending", config.publicSecurityNumber)

function showContact(id, value, href) {
  if (!value) return
  const row = document.querySelector(`#${id}`)
  const link = row?.querySelector("a")
  if (!row || !link) return
  link.textContent = value
  link.href = href
  row.removeAttribute("hidden")
}

function showFiling(id, value, href) {
  if (!value || !href) return
  const link = document.querySelector(`#${id}`)
  if (!link) return
  link.textContent = value
  link.href = href
  link.removeAttribute("hidden")
}

function togglePending(id, value) {
  if (!value) return
  document.querySelector(`#${id}`)?.setAttribute("hidden", "")
}
