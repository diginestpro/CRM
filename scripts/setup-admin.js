const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function setupAdmin() {
  const adminEmail = 'admin@crm.com';
  const adminPassword = 'AdminPassword123!';
  
  console.log('Creating user in Auth...');
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  });

  if (userError) {
    console.error('Error creating user:', userError);
    return;
  }
  console.log('User created successfully with ID:', userData.user.id);
  console.log('Now you can log in with:');
  console.log('Email: ' + adminEmail);
  console.log('Password: ' + adminPassword);
  
  console.log('\nNote: Profile and Company association might require manual setup in Supabase Dashboard due to permission errors on the public schema.');
}

setupAdmin();
