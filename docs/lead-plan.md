# Campaign Launcher: Lead Generation Support

## Overview

Fix the broken "Lead Generation" objective in the campaign launcher by adding:
1. **Lead Form Selection** - Fetch existing Instant Forms from Page, let user select one
2. **Click-to-Call CTA** - Add phone number field for call campaigns
3. **Link to Meta Form Builder** - "Create New Form" opens Meta's native builder

**Scope:** Meta only (Google later)

---

## Current Problem

The campaign launcher has a "Lead Generation" objective but it's **broken**:

```typescript
// create-campaign/route.ts lines 275-279
if (objective === 'conversions' && pixelId) {
  adsetPayload.promoted_object = {
    pixel_id: pixelId,
    custom_event_type: conversionEvent || 'PURCHASE'
  }
}
// For leads, promoted_object is NEVER set - campaigns created without forms!
```

**Result:** Lead campaigns are created but have no form attached, making them non-functional.

---

## Solution

### 1. Add Lead Form Fetching API

**New endpoint:** `/api/meta/lead-forms/route.ts`

```typescript
// GET - Fetch lead forms from Facebook Page
GET /api/meta/lead-forms?pageId={pageId}&accessToken={token}

// Response
{
  forms: [
    {
      id: "123456789",
      name: "Contact Us Form",
      status: "ACTIVE",
      questions: ["EMAIL", "PHONE_NUMBER", "FULL_NAME"],
      created_time: "2024-01-15T10:30:00Z",
      locale: "en_US"
    }
  ]
}
```

**Meta API call:**
```
GET /{page_id}/leadgen_forms?fields=id,name,status,questions,created_time,locale
```

### 2. Add Lead Form Step to Wizard

**File:** `components/launch-wizard.tsx`

Add new step for lead campaigns:

Page is already selected in Step 1. Use existing `state.pageId` to fetch forms.

```
┌─────────────────────────────────────────────────────────────┐
│  Lead Form                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Select Lead Form:                                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ○ Contact Request Form                                │   │
│  │   Email, Phone, Name • Created Jan 15                 │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ ○ Quote Request Form                                  │   │
│  │   Email, Phone, Name, Service Type • Created Dec 3    │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ ○ Newsletter Signup                                   │   │
│  │   Email only • Created Nov 20                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Don't have a form? [Create in Facebook →]                   │
│  (Opens Meta's Lead Ads Form Builder in new tab)             │
│                                                              │
│  ─────────────────────────────────────────────────────────   │
│                                                              │
│  📞 Click-to-Call (Optional)                                 │
│  [ ] Include phone number for call ads                       │
│  Phone: [+1 (555) 123-4567]                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3. Update Campaign Creation API

**File:** `app/api/meta/create-campaign/route.ts`

Add form_id to ad set creation for leads:

```typescript
// After line 279, add:
if (objective === 'leads' && formId) {
  adsetPayload.promoted_object = {
    page_id: pageId,
    lead_gen_form_id: formId
  }
}
```

Update creative creation for leads:

```typescript
// In object_story_spec for lead ads:
object_story_spec: {
  page_id: pageId,
  link_data: {
    link: destinationUrl,
    message: adCopy,
    name: headline,
    call_to_action: {
      type: "SIGN_UP", // or "LEARN_MORE", "GET_QUOTE", etc.
      value: {
        lead_gen_form_id: formId
      }
    },
    image_hash: creative.imageHash, // or video_id
  }
}
```

### 4. Click-to-Call Support

For ads with phone number:

```typescript
// CTA type for calls
call_to_action: {
  type: "CALL_NOW",
  value: {
    link: `tel:${phoneNumber}`
  }
}
```

---

## Implementation Steps

### Phase 1: API & Data (Backend)

1. **Create `/api/meta/lead-forms/route.ts`**
   - GET: Fetch forms from Page
   - Requires page_id and access_token
   - Return form id, name, status, questions, created_time

2. **Update `/api/meta/create-campaign/route.ts`**
   - Accept new params: `formId`, `pageId`, `phoneNumber`
   - Add `promoted_object` for leads with `lead_gen_form_id`
   - Update creative `call_to_action` for lead forms
   - Support `CALL_NOW` CTA type

### Phase 2: Wizard UI (Frontend)

3. **Update `components/launch-wizard.tsx`**
   - Add `selectedFormId` state (pageId already exists from step 1)
   - Add `phoneNumber` state for click-to-call
   - Add new `'leadform'` step type
   - Fetch forms using existing `state.pageId` when objective is 'leads'
   - Form list with radio buttons
   - "Create in Facebook" external link
   - Optional phone number input
   - Only show this step when objective === 'leads'

4. **Update wizard step flow**
   - Current: Account(Page) → Objective → Budget → Targeting → Creative → Copy → Review
   - New for Leads: Account(Page) → Objective → **Lead Form** → Budget → Targeting → Creative → Copy → Review

### Phase 3: CTA Options

5. **Add CTA type selection for leads**
   - Lead forms: SIGN_UP, LEARN_MORE, GET_QUOTE, SUBSCRIBE, APPLY_NOW
   - Call ads: CALL_NOW
   - Let user pick or auto-select based on form type

---

## Files to Modify

| File | Changes |
|------|---------|
| `app/api/meta/lead-forms/route.ts` | **NEW** - Fetch lead forms from Page |
| `app/api/meta/create-campaign/route.ts` | Add formId handling, lead creative CTAs, promoted_object for leads |
| `components/launch-wizard.tsx` | Add lead form step, form selector, phone input (reuse existing pageId) |

---

## Meta API Reference

### Fetch Lead Forms
```
GET /{page_id}/leadgen_forms
?fields=id,name,status,questions,created_time,locale,leads_count
&access_token={page_access_token}
```

### Lead Ad Creative
```json
{
  "object_story_spec": {
    "page_id": "{page_id}",
    "link_data": {
      "link": "https://example.com",
      "message": "Get a free quote!",
      "name": "Free Quote Request",
      "call_to_action": {
        "type": "GET_QUOTE",
        "value": {
          "lead_gen_form_id": "{form_id}"
        }
      }
    }
  }
}
```

### Ad Set Promoted Object for Leads
```json
{
  "promoted_object": {
    "page_id": "{page_id}",
    "lead_gen_form_id": "{form_id}"
  }
}
```

---

## CTA Types for Lead Ads

| CTA | Use Case |
|-----|----------|
| `SIGN_UP` | Newsletter, membership |
| `LEARN_MORE` | General info request |
| `GET_QUOTE` | Service businesses |
| `SUBSCRIBE` | Subscriptions |
| `APPLY_NOW` | Applications, jobs |
| `CONTACT_US` | General contact |
| `CALL_NOW` | Phone calls (requires phone number) |

---

## External Link for Form Creation

```
https://www.facebook.com/ads/lead_gen/create/?page_id={pageId}
```

This opens Meta's native Lead Ads Form Builder. After user creates form and returns to KillScale, they can click "Refresh" to see the new form in the list.

---

## Edge Cases

1. **No forms exist** - Show "No forms found" with prominent "Create in Facebook" link
2. **Page has no lead gen access** - Show error explaining Page needs leads_retrieval permission
3. **Form is ARCHIVED** - Filter out archived forms from list
4. **User doesn't select form** - Require form selection to proceed (validation)

---

## Not In Scope (Future)

- Google Ads lead form extensions
- Custom form builder within KillScale
- Lead data retrieval/CRM sync
- Form analytics/conversion tracking
- Messenger/Instagram lead forms
