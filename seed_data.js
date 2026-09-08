const https = require('https');

const SUPABASE_URL = 'https://axnulmpsrnfoxjegsmie.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bnVsbXBzcm5mb3hqZWdzbWllIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODU0NDM3NCwiZXhwIjoyMTA0MTIwMzc0fQ.Nb-aJCzzHnvtgZBEuaquMX0a7LcsPT9-8B_-RhC6lPg';

function supabaseRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Step 1: Check companies
  console.log('\n=== STEP 1: Check existing companies ===');
  const compRes = await supabaseRequest('/rest/v1/companies?select=id,name&limit=5', 'GET');
  console.log('Companies:', compRes.body);

  // Step 2: Seed services
  console.log('\n=== STEP 2: Seed services ===');
  const companies = JSON.parse(compRes.body);
  if (companies.length === 0) {
    console.log('No company exists yet - need to do onboarding first');
    return;
  }
  const companyId = companies[0].id;
  console.log('Using company:', companies[0].name, '(', companyId, ')');

  const services = [
    { company_id: companyId, name: 'Web Development', description: 'Full-stack web application development', base_price: 150.00, unit_type: 'hour', is_active: true },
    { company_id: companyId, name: 'Logo Design', description: 'Professional logo design with 3 concepts', base_price: 500.00, unit_type: 'project', is_active: true },
    { company_id: companyId, name: 'SEO Optimization', description: 'Monthly SEO service with reporting', base_price: 800.00, unit_type: 'month', is_active: true },
    { company_id: companyId, name: 'Content Writing', description: 'Blog posts and articles', base_price: 100.00, unit_type: 'hour', is_active: true },
    { company_id: companyId, name: 'Mobile App Development', description: 'iOS and Android development', base_price: 200.00, unit_type: 'hour', is_active: true },
    { company_id: companyId, name: 'Consulting', description: 'Business strategy consulting', base_price: 300.00, unit_type: 'hour', is_active: true }
  ];

  const svcRes = await supabaseRequest('/rest/v1/services', 'POST', services);
  console.log('Services insert status:', svcRes.status);
  console.log('Services created:', JSON.parse(svcRes.body).length);

  // Step 3: Seed clients
  console.log('\n=== STEP 3: Seed clients ===');
  const clients = [
    { company_id: companyId, full_name: 'Acme Corporation', company_name: 'Acme Corp', email: 'contact@acme.test', phone: '+1 555 0100', website: 'https://acme.test', tax_number: 'TAX-1001', country: 'United States', notes: 'VIP customer since 2024' },
    { company_id: companyId, full_name: 'Globex Industries', company_name: 'Globex', email: 'info@globex.test', phone: '+44 20 7946 0958', website: 'https://globex.test', tax_number: 'TAX-1002', country: 'United Kingdom', notes: 'Prefers email communication' },
    { company_id: companyId, full_name: 'Initech Software', company_name: 'Initech', email: 'admin@initech.test', phone: '+1 555 0200', country: 'Canada', notes: 'Enterprise client' },
    { company_id: companyId, full_name: 'Stark Industries', company_name: 'Stark', email: 'jarvis@stark.test', phone: '+1 555 0300', website: 'https://stark.test', country: 'United States', notes: 'High-budget projects' },
    { company_id: companyId, full_name: 'Wayne Enterprises', company_name: 'Wayne Corp', email: 'b.wayne@wayne.test', phone: '+1 555 0400', country: 'United States', notes: 'Top-tier client' }
  ];

  const cliRes = await supabaseRequest('/rest/v1/clients', 'POST', clients);
  console.log('Clients insert status:', cliRes.status);
  const createdClients = JSON.parse(cliRes.body);
  console.log('Clients created:', createdClients.length);

  // Step 4: Get services for use in quotations/invoices
  const svcListRes = await supabaseRequest('/rest/v1/services?select=id,name,base_price&order=name', 'GET');
  const createdServices = JSON.parse(svcListRes.body);
  console.log('Services available:', createdServices.map(s => s.name).join(', '));

  // Step 5: Create quotations
  console.log('\n=== STEP 5: Seed quotations ===');
  const quotations = [
    {
      company_id: companyId,
      client_id: createdClients[0].id,
      quotation_number: 'QT-2026-001',
      status: 'Accepted',
      issue_date: '2026-08-15',
      expiry_date: '2026-09-15',
      total_amount: 4500.00,
      notes: 'Website redesign project'
    },
    {
      company_id: companyId,
      client_id: createdClients[1].id,
      quotation_number: 'QT-2026-002',
      status: 'Sent',
      issue_date: '2026-08-20',
      expiry_date: '2026-09-20',
      total_amount: 1600.00,
      notes: 'Logo and branding package'
    },
    {
      company_id: companyId,
      client_id: createdClients[2].id,
      quotation_number: 'QT-2026-003',
      status: 'Draft',
      issue_date: '2026-09-01',
      total_amount: 800.00,
      notes: 'SEO services for Q4'
    },
    {
      company_id: companyId,
      client_id: createdClients[3].id,
      quotation_number: 'QT-2026-004',
      status: 'Rejected',
      issue_date: '2026-08-10',
      total_amount: 6000.00,
      notes: 'Mobile app development - too expensive'
    }
  ];

  const qRes = await supabaseRequest('/rest/v1/quotations', 'POST', quotations);
  console.log('Quotations insert status:', qRes.status);
  const createdQuotations = JSON.parse(qRes.body);
  console.log('Quotations created:', createdQuotations.length);

  // Step 6: Create invoices
  console.log('\n=== STEP 6: Seed invoices ===');
  const invoices = [
    {
      company_id: companyId,
      client_id: createdClients[0].id,
      invoice_number: 'INV-2026-001',
      status: 'Paid',
      issue_date: '2026-08-20',
      due_date: '2026-09-03',
      subtotal: 4500.00,
      total_amount: 4500.00,
      amount_paid: 4500.00,
      notes: 'First invoice - paid in full'
    },
    {
      company_id: companyId,
      client_id: createdClients[1].id,
      invoice_number: 'INV-2026-002',
      status: 'Sent',
      issue_date: '2026-08-25',
      due_date: '2026-09-08',
      subtotal: 1600.00,
      total_amount: 1600.00,
      amount_paid: 0,
      notes: 'Branding package - awaiting payment'
    },
    {
      company_id: companyId,
      client_id: createdClients[3].id,
      invoice_number: 'INV-2026-003',
      status: 'Unpaid',
      issue_date: '2026-09-01',
      due_date: '2026-09-15',
      subtotal: 3200.00,
      total_amount: 3200.00,
      amount_paid: 0,
      notes: 'Consulting hours'
    },
    {
      company_id: companyId,
      client_id: createdClients[4].id,
      invoice_number: 'INV-2026-004',
      status: 'Overdue',
      issue_date: '2026-07-15',
      due_date: '2026-07-29',
      subtotal: 1200.00,
      total_amount: 1200.00,
      amount_paid: 0,
      notes: 'Past due - follow up needed'
    }
  ];

  const invRes = await supabaseRequest('/rest/v1/invoices', 'POST', invoices);
  console.log('Invoices insert status:', invRes.status);
  const createdInvoices = JSON.parse(invRes.body);
  console.log('Invoices created:', createdInvoices.length);

  // Step 7: Create payments
  console.log('\n=== STEP 7: Seed payments ===');
  const payments = [
    {
      invoice_id: createdInvoices[0].id,
      amount: 4500.00,
      payment_date: '2026-09-02',
      payment_method: 'Bank Transfer',
      reference_number: 'TXN-001',
      status: 'Completed',
      notes: 'Wire transfer received'
    }
  ];
  const payRes = await supabaseRequest('/rest/v1/invoice_payments', 'POST', payments);
  console.log('Payments insert status:', payRes.status);
  console.log('Payments created:', JSON.parse(payRes.body).length);

  // Final verification
  console.log('\n=== FINAL VERIFICATION ===');
  const tables = ['companies', 'services', 'clients', 'quotations', 'invoices', 'invoice_payments'];
  for (const table of tables) {
    const res = await supabaseRequest(`/rest/v1/${table}?select=id&limit=0`, 'GET');
    const rangeHeader = JSON.stringify(res);
    console.log(`Table ${table}: ${res.status}`);
  }
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
