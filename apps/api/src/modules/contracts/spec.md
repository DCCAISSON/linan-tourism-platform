# 旅游合同接口

DTO 以同目录 contracts.types.ts 为准；全文为纯文本，所有时间为 ISO 字符串，金额单位分。

范本种类固定为 domestic_group_tour / staff_recuperation；签字范围固定为 signingScope=individual_reading_confirmation。scopeStatement 明示当前签字人本人阅读确认，未成年人需相应监护资格或合法授权，不代表单位、其他成年同行人或旅行社签章。

- GET /contracts/staff/sources → { sources: ContractSource[] }
- GET /contracts/staff/sessions/:id → ContractSessionResponse
- POST /contracts/staff/sessions/:id/versions，NewContractTemplate → ContractTemplate（201）
- PUT /contracts/staff/sessions/:id/active，{ templateId: string | null } → ContractSessionResponse
- GET /orders/:orderId/contract → ContractResponse
- POST /orders/:orderId/contract/sign，SignContractInput → ContractResponse（201）
- GET /contracts/staff/orders/:orderId → ContractResponse

状态：pending_parent_signature 待家长签字；parent_signed_pending_agency 家长已签字，待旅行社处理。合同不存在时 contract=null（旧单/未启用团期不需签字）。旅行社签章与监管填报另行处理。

签字必须是 phoneVerified=true 的本人家庭会话。签名字数 1–120；signature width/height 为 100–2000 的有限整数；1–100 条笔画、合计 10–5000 点；每点仅 x/y，有限坐标在画布范围内；累计笔迹长度至少画布短边的 0.2 倍；JSON ≤128KiB。禁止空白、重复单点及越界笔迹。

错误码：400 contract_input_invalid；403 contract_phone_required / staff_scope_forbidden；404 not_found；409 contract_snapshot_changed / contract_already_signed / contract_order_not_signable / contract_signature_required / contract_version_conflict。无身份401，他人家庭订单404。完全相同的签字请求幂等返回；已签笔迹与姓名/签字人不能覆盖。

模板须工作人员 reviewed:true，创建不自动启用；显式激活只作用于随后新建订单。后台查看订单合同需 orders.read、sensitive_data.read 和覆盖该团期/学校的范围，并记录审计。配置需要 configuration.read/write 及对应范围，修改检查来源。

模板输入：title 1–200 字符，version/sourceId 1–64 字符，bodyText 1–150000 字符；非空字符串按trim后储存。请求仍受现有HTTP服务的整体大小限制。sourceFilename/sourceSha256/kind只由服务器来源白名单赋值，不接受客户端覆盖。来源另返回bodySha256；实际版本正文单独计算bodySha256。
