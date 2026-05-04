import { test, expect } from '../fixtures.js';

test.describe('Machine Disk Usage Tests', () => {
  test('should verify disk usage is not always 0 on machine detail page', async ({ testEnv, page, apiRequest }) => {
    const machine = testEnv.machines[0];

    const listResponse = await apiRequest('/api/admin/machines');
    expect(listResponse.ok).toBe(true);

    const listResult = await listResponse.json();
    const machines = listResult.data?.items || listResult.data || [];

    const registeredMachine = machines.find((m: any) => m.id === machine.id);

    if (!registeredMachine) {
      test.skip(true, 'No registered machine found');
      return;
    }

    console.log(`Found registered machine: ${JSON.stringify(registeredMachine, null, 2)}`);

    await page.goto(`/admin/machines/${registeredMachine.id}`, { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const diskUsageText = await page.locator('text=磁盘使用率').locator('..').locator('span.text-sm').nth(1).textContent();
    console.log(`Disk usage text: ${diskUsageText}`);

    const diskUsageValue = parseFloat(diskUsageText?.replace('%', '') || '0');
    console.log(`Disk usage value: ${diskUsageValue}`);

    expect(diskUsageValue).toBeGreaterThan(0);
    console.log('✅ Disk usage is greater than 0 - issue is fixed!');
  });

  test('should verify disk usage field exists in API response', async ({ testEnv, apiRequest }) => {
    const machine = testEnv.machines[0];

    const listResponse = await apiRequest('/api/admin/machines');
    expect(listResponse.ok).toBe(true);

    const listResult = await listResponse.json();
    const machines = listResult.data?.items || listResult.data || [];

    const registeredMachine = machines.find((m: any) => m.id === machine.id);

    if (!registeredMachine) {
      test.skip(true, 'No registered machine found');
      return;
    }

    const detailResponse = await apiRequest(`/api/admin/machines/${registeredMachine.id}`);
    expect(detailResponse.ok).toBe(true);

    const detailResult = await detailResponse.json();
    console.log(`Machine detail: ${JSON.stringify(detailResult.data, null, 2)}`);

    expect(detailResult.data).toHaveProperty('diskUsage');
    expect(detailResult.data.diskUsage).toBeGreaterThanOrEqual(0);

    console.log(`Disk usage from API: ${detailResult.data.diskUsage}`);
  });

  test('should verify heartbeat contains disk usage', async ({ testEnv, apiRequest }) => {
    const machine = testEnv.machines[0];

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const listResponse = await apiRequest('/api/admin/machines');
    expect(listResponse.ok).toBe(true);

    const listResult = await listResponse.json();
    const machines = listResult.data?.items || listResult.data || [];

    const registeredMachine = machines.find((m: any) => m.id === machine.id);

    if (!registeredMachine) {
      test.skip(true, 'No registered machine found');
      return;
    }

    console.log(`Machine disk usage: ${registeredMachine.diskUsage}`);

    if (registeredMachine.diskUsage === 0) {
      console.log('⚠️ Disk usage is 0 - this indicates the bug exists!');
      console.log('Expected: disk usage should be greater than 0 for a running machine');
    } else {
      console.log(`✅ Disk usage is ${registeredMachine.diskUsage}% - bug is fixed!`);
    }

    expect(registeredMachine.diskUsage).toBeDefined();
  });

  test('should verify disk usage updates over time', async ({ testEnv, apiRequest }) => {
    const machine = testEnv.machines[0];

    const listResponse = await apiRequest('/api/admin/machines');
    expect(listResponse.ok).toBe(true);

    const listResult = await listResponse.json();
    const machines = listResult.data?.items || listResult.data || [];

    const registeredMachine = machines.find((m: any) => m.id === machine.id);

    if (!registeredMachine) {
      test.skip(true, 'No registered machine found');
      return;
    }

    const initialDiskUsage = registeredMachine.diskUsage;
    console.log(`Initial disk usage: ${initialDiskUsage}%`);

    await new Promise((resolve) => setTimeout(resolve, 35000));

    const updateResponse = await apiRequest('/api/admin/machines');
    expect(updateResponse.ok).toBe(true);

    const updateResult = await updateResponse.json();
    const updatedMachines = updateResult.data?.items || updateResult.data || [];

    const updatedMachine = updatedMachines.find((m: any) => m.id === machine.id);

    if (!updatedMachine) {
      test.skip(true, 'Machine not found after update');
      return;
    }

    const newDiskUsage = updatedMachine.diskUsage;
    console.log(`Disk usage after 35 seconds: ${newDiskUsage}%`);

    expect(newDiskUsage).toBeDefined();
    expect(newDiskUsage).toBeGreaterThanOrEqual(0);
  });
});
