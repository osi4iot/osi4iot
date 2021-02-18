import { Pool } from 'pg';
import { app } from './app'
import GrafanaApi from './GrafanaApi/grafanaApi';

const port = process.env.PORT || 3200;

const grafanaApi = new GrafanaApi();

const pool = new Pool({
    user: 'dicapua',
    host: 'pg_admin_api:5433',
    password: '123456',
    database: 'admin_api_db',
    port: 5433
});

app.get('/users', async (req, res) => {
    const users = await grafanaApi.getUsers();
    res.status(200).json(users);
});

app.post('/users', async (req, res) => {
    const msg = await grafanaApi.createUsers(req.body);
    res.status(200).json(msg);
});

app.post('/teams', async (req, res) => {
    const msg = await grafanaApi.createTeam(req.body);
    res.status(200).json(msg);
});

app.get('/teams/search', async (req, res) => {
    const perpage = req.query.perpage ? parseInt(req.query.perpage as string, 10) : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const query = req.query.query ? req.query.query as string : undefined;
    const name = req.query.name  ? req.query.name as string : undefined;
    const teamsWithPaging = await grafanaApi.getTeamsWithPaging(perpage, page, query, name);
    res.status(200).json(teamsWithPaging);
});

app.get('/teams/:teamId', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const team = await grafanaApi.getTeamById(teamId);
    res.status(200).json(team);
});

app.put('/teams/:teamId', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const message = await grafanaApi.updateTeamById(teamId, req.body);
    res.status(200).json(message);
});

app.delete('/teams/:teamId', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const message = await grafanaApi.deleteTeamById(teamId);
    res.status(200).json(message);
});

app.get('/teams/:teamId/members', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const members = await grafanaApi.getTeamMembers(teamId);
    res.status(200).json(members);
});

app.post('/teams/:teamId/member', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const msg = await grafanaApi.addMemberToTeam(teamId, req.body);
    res.status(200).json(msg);
});


app.post('/teams/:teamId/members', async (req, res) => {
    const teamId = parseInt(req.params.teamId,10);
    const msg = await grafanaApi.addTeamMembers(teamId, req.body);
    res.status(200).json(msg);
});

app.delete('/teams/:teamId/members/:userId', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const userId = parseInt(req.params.userId, 10);
    const msg = await grafanaApi.removeMemberFromTeam(teamId, userId);
    res.status(200).json(msg);
});

app.post('/folders', async (req, res) => {
    const msg = await grafanaApi.createFolder(req.body);
    res.status(200).json(msg);
});

app.post('/folders/:uid/permissions', async (req, res) => {
    const uid = req.params.uid;
    const msg = await grafanaApi.folderPermission(uid, req.body);
    res.status(200).json(msg);
});



app.get('/get_users', async (req, res) => {
    const response = await pool.query('SELECT * FROM "user" ORDER BY id ASC');
    res.status(200).json(response.rows);
});

app.get('/phones', async (req, res) => {
    const response = await pool.query('CREATE TABLE IF NOT EXISTS phones (id serial PRIMARY KEY, phone_number bigint, user_id integer REFERENCES "user" (id))');
    res.status(200).send(response);
});

app.get('/addphone', async (req, res) => {
    const phone_number = 34605354114;
    const user_id = 2;
    await pool.query('INSERT INTO phones (phone_number, user_id) VALUES ($1, $2)', [phone_number, user_id]);
    res.json({
        message: 'User Added successfully',
        body: {
            phone: {phone_number, user_id}
        }
    })
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
