-- View that strips imageBase64/imageMimeType from product_info JSONB
-- product_info contains embedded base64 images (~2-5MB each) that are
-- only needed when generating images, not for listing sessions.
-- This view saves ~92MB on the list query for 50 sessions.

CREATE OR REPLACE VIEW ad_studio_sessions_list AS
SELECT
  id, user_id, ad_account_id, product_url,
  product_info - 'imageBase64' - 'imageMimeType' AS product_info,
  competitor_company, generated_images, image_style,
  status, created_at, updated_at
FROM ad_studio_sessions;
