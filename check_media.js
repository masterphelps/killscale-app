const fs = require("fs");
const envFile = fs.readFileSync(".env.local", "utf8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Delete all media_library entries
  const { error: delError, count } = await supabase
    .from("media_library")
    .delete({ count: "exact" })
    .gt("id", 0); // delete all rows

  if (delError) {
    console.error("Delete error:", delError);
    return;
  }
  console.log("Deleted media_library rows:", count);

  // Verify empty
  const { data: remaining } = await supabase.from("media_library").select("id").limit(5);
  console.log("Remaining rows:", remaining?.length || 0);
})();
