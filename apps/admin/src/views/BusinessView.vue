<template>
  <section class="business-page" aria-labelledby="business-title">
    <header class="business-heading">
      <div>
        <p class="business-heading__eyebrow">基础业务</p>
        <h2 id="business-title">旅游、疗休养与民宿内容</h2>
      </div>
      <p>维护已获授权的公开资料和咨询跟进；不在此记录支付、库存、实时房态或 PMS/OTA 状态。</p>
    </header>

    <div class="business-grid">
      <section v-if="businessContentEditorEnabled" class="business-card">
        <div class="business-card__head">
          <h3>内容维护</h3>
          <el-button type="primary" :loading="productBusy" @click="saveProduct">保存内容</el-button>
        </div>
        <el-alert v-if="productMessage" :title="productMessage" type="success" show-icon />
        <el-alert v-if="productError" :title="productError" type="error" show-icon />
        <el-form label-position="top" class="business-form">
          <el-form-item label="所属机构 ID">
            <el-input v-model="form.organizationId" placeholder="请选择所属机构" />
          </el-form-item>
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
            <el-input v-model="form.content" type="textarea" :rows="5" maxlength="8000" />
          </el-form-item>
          <el-form-item label="参考价格（元，可空）">
            <el-input v-model="priceYuan" inputmode="decimal" placeholder="不确定则留空" />
          </el-form-item>
          <el-form-item label="客服电话">
            <el-input v-model="form.customerServicePhone" maxlength="32" />
          </el-form-item>
          <el-form-item label="已授权预订入口 HTTPS">
            <el-input v-model="form.bookingUrl" placeholder="未确认授权则留空" />
          </el-form-item>
          <el-checkbox v-model="form.bookingAuthorized">该入口已由业务方确认可公开</el-checkbox>
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
        </el-form>
      </section>

      <section class="business-card">
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
        </el-table>
      </section>

      <section class="business-card business-card--wide">
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
        </el-table>
        <el-form v-if="selectedInquiry" class="business-form business-followup" label-position="top">
          <h4>跟进：{{ selectedInquiry.contactName }}</h4>
          <el-form-item label="状态">
            <el-select v-model="followup.status">
              <el-option label="咨询" value="inquiry" />
              <el-option label="处理中" value="processing" />
              <el-option label="已结束" value="closed" />
            </el-select>
          </el-form-item>
          <el-form-item label="负责人账号 ID">
            <el-input v-model="followup.ownerStaffAccountId" />
          </el-form-item>
          <el-form-item label="跟进记录">
            <el-input v-model="followup.note" type="textarea" :rows="3" maxlength="2000" />
          </el-form-item>
          <el-button type="primary" :loading="followupBusy" @click="saveFollowup">保存跟进</el-button>
        </el-form>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import "@/styles/business.css"
import { categoryOptions, categoryText, formatFen, inquiryStatusText, statusText, useBusinessView } from "@/views/business/useBusinessView"

const { products, inquiries, selectedInquiry, productsLoading, inquiriesLoading, productBusy, followupBusy, productError, productMessage, followupError, followupMessage, mediaText, priceYuan, form, followup, loadProducts, loadInquiries, saveProduct, selectProduct, selectInquiry, saveFollowup } = useBusinessView()
const businessContentEditorEnabled = false
</script>
