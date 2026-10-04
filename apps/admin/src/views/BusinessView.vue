<template>
  <section class="business-page" aria-labelledby="business-title">
    <header class="business-heading">
      <div>
        <p class="business-heading__eyebrow">基础业务</p>
        <h2 id="business-title">旅游、疗休养与民宿内容</h2>
      </div>
      <p>维护业务资料，查看咨询需求并安排工作人员跟进。</p>
    </header>
    <p v-if="accessLoading" role="status">正在读取业务权限…</p>
    <el-alert v-if="accessError" :title="accessError" type="error" show-icon />
    <el-button v-if="accessError" @click="initialize">重新读取</el-button>
    <div class="business-grid">
      <section v-if="canWrite" class="business-card">
        <div class="business-card__head">
          <h3>{{ selectedProduct ? '编辑内容' : '新增内容' }}</h3>
          <el-button :disabled="productBusy" @click="newProduct">新增内容</el-button>
        </div>
        <el-alert v-if="productMessage" :title="productMessage" type="success" show-icon />
        <el-alert v-if="productError" :title="productError" type="error" show-icon />
        <el-form label-position="top" class="business-form">
          <el-form-item label="所属机构">
            <el-select v-model="form.organizationId" placeholder="请选择所属机构" :disabled="selectedProduct !== undefined">
              <el-option v-for="organization in organizations" :key="organization.id" :label="organization.name" :value="organization.id" />
            </el-select>
          </el-form-item>
          <p v-if="!accessLoading && organizations.length === 0">暂无可维护的机构，请联系管理员核对权限。</p>
          <el-form-item label="分类">
            <el-segmented v-model="form.category" :options="categoryOptions" />
          </el-form-item>
          <el-form-item label="标题">
            <el-input v-model="form.title" maxlength="160" />
          </el-form-item>
          <el-form-item label="线路/套餐/房型">
            <el-input v-model="form.offering" maxlength="500" />
          </el-form-item>
          <el-form-item label="介绍">
            <el-input v-model="form.content" type="textarea" :rows="5" maxlength="8000" placeholder="说明行程或入住安排、费用包含及不含项目；疗休养可补充人数、住宿、用餐及结算说明。" />
          </el-form-item>
          <el-form-item label="参考价格（元，可空）">
            <el-input v-model="priceYuan" inputmode="decimal" placeholder="不确定则留空" />
          </el-form-item>
          <el-form-item label="客服电话">
            <el-input v-model="form.customerServicePhone" maxlength="32" />
          </el-form-item>
          <el-form-item label="预订入口链接">
            <el-input v-model="form.bookingUrl" placeholder="未确认授权则留空" />
          </el-form-item>
          <el-checkbox v-model="form.bookingAuthorized">该入口已由业务方确认可公开</el-checkbox>
          <p>可填写现有 PMS、OTA 或服务方预订网页；需使用 HTTPS，并在微信小程序后台配置业务域名。授权公开不代表已完成域名配置。</p>
          <el-form-item label="公开素材 HTTPS，每行一条，image 或 video 用空格分隔">
            <el-input v-model="mediaText" type="textarea" :rows="4" placeholder="每行填写一个已授权公开素材链接" />
          </el-form-item>
          <el-checkbox v-model="form.mediaAuthorized">素材已获公开授权</el-checkbox>
          <el-form-item label="发布状态">
            <el-select v-model="form.status">
              <el-option label="草稿" value="draft" />
              <el-option label="已发布" value="published" />
              <el-option label="已归档" value="archived" />
            </el-select>
          </el-form-item>
          <el-button type="primary" :loading="productBusy" :disabled="!form.organizationId" @click="saveProduct">保存内容</el-button>
        </el-form>
      </section>

      <section v-if="canRead" class="business-card" :class="{ 'business-card--wide': !canWrite }">
        <div class="business-card__head">
          <h3>内容列表</h3>
          <el-button :loading="productsLoading" @click="loadProducts">刷新</el-button>
        </div>
        <el-empty v-if="!productsLoading && products.length === 0" description="暂无旅游、疗休养或民宿内容" />
        <el-table v-else :data="products" v-loading="productsLoading" row-key="id" @row-click="selectProduct">
          <el-table-column prop="title" label="标题" min-width="150" />
          <el-table-column label="分类" width="90">
            <template #default="{ row }">{{ categoryText(row.category) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">{{ statusText(row.status) }}</template>
          </el-table-column>
          <el-table-column label="参考价" width="110">
            <template #default="{ row }">{{ row.referencePriceFen === null ? "待确认" : formatFen(row.referencePriceFen) }}</template>
          </el-table-column>
          <el-table-column v-if="canWrite" label="操作" width="80">
            <template #default="{ row }"><el-button link type="primary" @click.stop="selectProduct(row)">编辑</el-button></template>
          </el-table-column>
        </el-table>
      </section>

      <section v-if="canFollowup" class="business-card business-card--wide">
        <div class="business-card__head">
          <h3>咨询跟进</h3>
          <el-button :loading="inquiriesLoading" @click="loadInquiries">刷新</el-button>
        </div>
        <el-alert v-if="followupMessage" :title="followupMessage" type="success" show-icon />
        <el-alert v-if="followupError" :title="followupError" type="error" show-icon />
        <el-empty v-if="!inquiriesLoading && inquiries.length === 0" description="暂无业务咨询" />
        <el-table v-else :data="inquiries" v-loading="inquiriesLoading" row-key="id" @row-click="selectInquiry">
          <el-table-column prop="contactName" label="联系人" width="120" />
          <el-table-column prop="phone" label="电话" width="140" />
          <el-table-column prop="request" label="需求" min-width="220" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">{{ inquiryStatusText(row.status) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="80">
            <template #default="{ row }"><el-button link type="primary" :disabled="followupBusy" @click.stop="selectInquiry(row)">详情</el-button></template>
          </el-table-column>
        </el-table>
        <p v-if="detailLoading" role="status">正在读取咨询详情…</p>
        <el-form v-if="selectedInquiry" class="business-form business-followup" label-position="top">
          <h4>咨询详情：{{ selectedInquiry.contactName }}</h4>
          <dl class="business-detail-fields">
            <div><dt>咨询产品</dt><dd>{{ selectedInquiry.productTitle }}</dd></div>
            <div><dt>咨询对象</dt><dd>{{ selectedInquiry.customerType === 'organization' ? selectedInquiry.organizationName : '个人' }}</dd></div>
            <div><dt>联系电话</dt><dd>{{ selectedInquiry.phone }}</dd></div>
            <div><dt>当前负责人</dt><dd>{{ selectedInquiry.ownerDisplayName }}</dd></div>
            <div><dt>咨询需求</dt><dd>{{ selectedInquiry.request }}</dd></div>
          </dl>
          <section v-if="canReadCustomer" class="business-customer-links" aria-label="关联客户">
            <h4>关联客户</h4>
            <p v-if="selectedInquiry.linkedCustomer">
              <RouterLink :to="{ path: '/crm', query: { customerId: selectedInquiry.linkedCustomer.id } }">{{ selectedInquiry.linkedCustomer.displayName }} · {{ selectedInquiry.linkedCustomer.phoneMasked }}</RouterLink>
            </p>
            <p v-else>尚未关联客户。</p>
            <template v-if="canLinkCustomer">
              <el-form-item label="选择既有客户">
                <el-select v-model="customerId" placeholder="请选择本机构客户" filterable :disabled="followupBusy">
                  <el-option v-for="customer in customerCandidates" :key="customer.id" :value="customer.id" :label="`${customer.displayName} · ${customer.phoneMasked}`" />
                </el-select>
              </el-form-item>
              <p v-if="customerCandidates.length === 0">本机构暂无可关联的既有客户。</p>
              <el-button :disabled="followupBusy || !customerId || customerId === selectedInquiry.linkedCustomer?.id" @click="saveCustomerLink()">保存客户关联</el-button>
              <el-button :disabled="followupBusy || !selectedInquiry.linkedCustomer" @click="saveCustomerLink(true)">解除客户关联</el-button>
            </template>
            <h4>客户关联历史</h4>
            <p v-if="selectedInquiry.customerHistory.length === 0">尚无关联变更。</p>
            <ol v-else class="business-history">
              <li v-for="item in selectedInquiry.customerHistory" :key="item.id">
                {{ item.createdAt.replace('T', ' ').slice(0, 16) }} · {{ item.action === 'linked' ? '关联' : '解除关联' }}
                <RouterLink :to="{ path: '/crm', query: { customerId: item.customerId } }">{{ item.displayName }}</RouterLink>
                · 操作人 {{ item.actorId }}
              </li>
            </ol>
          </section>
          <h4>跟进历史</h4>
          <p v-if="selectedInquiry.history.length === 0">尚无跟进记录。</p>
          <ol v-else class="business-history">
            <li v-for="item in selectedInquiry.history" :key="item.id">
              <p>{{ item.createdAt.replace('T', ' ').slice(0, 16) }} · {{ item.ownerDisplayName }} · {{ inquiryStatusText(item.status) }}</p>
              <p>{{ item.note }}</p>
            </li>
          </ol>
          <h4>新增跟进</h4>
          <el-form-item label="状态">
            <el-select v-model="followup.status">
              <el-option label="咨询" value="inquiry" />
              <el-option label="处理中" value="processing" />
              <el-option label="已结束" value="closed" />
            </el-select>
          </el-form-item>
          <el-form-item label="跟进负责人">
            <el-select v-model="followup.ownerStaffAccountId" placeholder="请选择负责人" filterable :disabled="followupBusy">
              <el-option v-for="owner in owners" :key="owner.id" :label="owner.displayName" :value="owner.id" />
            </el-select>
          </el-form-item>
          <p v-if="owners.length === 0">当前没有可分派的业务人员，请联系管理员配置。</p>
          <el-form-item label="跟进记录">
            <el-input v-model="followup.note" type="textarea" :rows="3" maxlength="2000" />
          </el-form-item>
          <el-button type="primary" :loading="followupBusy" :disabled="!followup.ownerStaffAccountId || !followup.note.trim()" @click="saveFollowup">保存跟进</el-button>
        </el-form>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import "@/styles/business.css"
import { categoryOptions, categoryText, formatFen, inquiryStatusText, statusText, useBusinessView } from "@/views/business/useBusinessView"

const { canReadCustomer, canLinkCustomer, customerCandidates, customerId, saveCustomerLink, canRead, canWrite, canFollowup, accessLoading, accessError, initialize, organizations, owners, selectedProduct, detailLoading, products, inquiries, selectedInquiry, productsLoading, inquiriesLoading, productBusy, followupBusy, productError, productMessage, followupError, followupMessage, mediaText, priceYuan, form, followup, loadProducts, loadInquiries, saveProduct, selectProduct, selectInquiry, saveFollowup, newProduct } = useBusinessView()
</script>
