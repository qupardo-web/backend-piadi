const { User, Role } = require('../models');

async function seedDatabase() {
  try {
    // 1. Seed Roles first
    const roleCount = await Role.count();
    let roleMap = {};

    if (roleCount === 0) {
      console.log('No roles found in database. Seeding default roles...');
      
      const rolesToSeed = [
        { name: 'Director Académico', group: 'Direccion', description: 'Dirección académica general' },
        { name: 'Director de Administración', group: 'Direccion', description: 'Dirección de administración y finanzas' },
        { name: 'Rector', group: 'Rectoria', description: 'Máxima autoridad institucional' },
        { name: 'Analista de Calidad', group: 'Calidad', description: 'Aseguramiento interno de calidad' }
      ];

      for (const roleData of rolesToSeed) {
        const createdRole = await Role.create(roleData);
        roleMap[roleData.name] = createdRole.id;
      }
      console.log('Roles seeded successfully.');
    } else {
      console.log('Roles table already contains data. Fetching roles map...');
      const existingRoles = await Role.findAll();
      existingRoles.forEach(r => {
        roleMap[r.name] = r.id;
      });
    }

    // 2. Seed Users
    const userCount = await User.count();
    if (userCount === 0) {
      console.log('No users found in database. Seeding default users...');

      // Seed 1: Ezequiel Araya (Director Académico - group: Direccion)
      await User.create({
        email: 'director.educacion@ecas.cl',
        username: 'director.educacion@ecas.cl',
        name: 'Ezequiel Araya',
        password: 'admin123',
        roleId: roleMap['Director Académico']
      });

      // Seed 2: Rector (group: Rectoria)
      await User.create({
        email: 'rectoria@ecas.cl',
        username: 'rectoria@ecas.cl',
        name: 'Rectoría ECAS',
        password: 'admin123',
        roleId: roleMap['Rector']
      });

      // Seed 3: Analista de Calidad (group: Calidad)
      await User.create({
        email: 'calidad@ecas.cl',
        username: 'calidad@ecas.cl',
        name: 'Aseguramiento de Calidad',
        password: 'admin123',
        roleId: roleMap['Analista de Calidad']
      });

      // Seed 4: Admin (generic username fallback for testing - mapping to Director de Administración)
      await User.create({
        email: 'admin@ecas.cl',
        username: 'admin',
        name: 'Administrador Demo',
        password: 'admin123',
        roleId: roleMap['Director de Administración']
      });

      console.log('Default users seeded successfully.');
    } else {
      console.log('Users table already contains data. Skipping seeding.');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

module.exports = { seedDatabase };
