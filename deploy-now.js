const https = require('https');
const RENDER_API_KEY = 'rnd_vQDzwjZq3NojNUlbdWZxcj8Z9JYS';

function renderRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.render.com',
            port: 443,
            path: path,
            method: method,
            headers: {
                'Authorization': `Bearer ${RENDER_API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };
        
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve(body);
                }
            });
        });
        
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function main() {
    console.log('查找 qinglong 服务...');
    
    const services = await renderRequest('GET', '/v1/services');
    const qinglong = services.find(s => s.service?.name === 'qinglong');
    
    if (!qinglong) {
        console.log('未找到服务，需要创建新服务');
        return;
    }
    
    const serviceId = qinglong.service.id;
    console.log(`找到服务: ${serviceId}`);
    
    // 更新环境变量
    console.log('\n更新环境变量...');
    const envVars = [
        { key: 'SUPABASE_HOST', value: 'aws-1-ap-south-1.pooler.supabase.com' },
        { key: 'SUPABASE_PORT', value: '6543' },
        { key: 'SUPABASE_USER', value: 'postgres.gijtjlnitigrfhfwfkcq' },
        { key: 'SUPABASE_PASSWORD', value: 'Lm.-..---...-.' },
        { key: 'SUPABASE_DB', value: 'postgres' },
        { key: 'SUPABASE_URL', value: 'https://gijtjlnitigrfhfwfkcq.supabase.co' },
        { key: 'PUPPETEER_SKIP_DOWNLOAD', value: 'true' },
        { key: 'NODE_OPTIONS', value: '--max-old-space-size=400' },
        { key: 'TZ', value: 'Asia/Shanghai' }
    ];
    
    for (const env of envVars) {
        try {
            await renderRequest('POST', `/v1/services/${serviceId}/env-vars`, env);
            console.log(`  ✓ ${env.key}`);
        } catch (e) {
            console.log(`  - ${env.key}`);
        }
    }
    
    // 触发部署
    console.log('\n触发部署...');
    try {
        await renderRequest('POST', `/v1/services/${serviceId}/deploys`, { clearCache: 'clear' });
        console.log('✓ 部署已触发');
    } catch (e) {
        console.log('部署中...');
    }
    
    console.log('\n========================================');
    console.log('部署进行中，请等待 3-5 分钟');
    console.log('========================================');
}

main().catch(console.error);
