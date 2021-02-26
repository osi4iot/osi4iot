import { Router } from 'express';
import GrafanaApi from '../GrafanaApi/grafanaApi';

const route = Router();
const grafanaApi = new GrafanaApi();

route.get('/users', async (req, res) => {
    const users = await grafanaApi.getUsers();
    res.status(200).json(users);
});

route.post('/users', async (req, res) => {
    const msg = await grafanaApi.createUsers(req.body);
    res.status(200).json(msg);
});

route.post('/teams', async (req, res) => {
    const msg = await grafanaApi.createTeam(req.body);
    res.status(200).json(msg);
});

route.get('/teams/search', async (req, res) => {
    const perpage = req.query.perpage ? parseInt(req.query.perpage as string, 10) : undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const query = req.query.query ? req.query.query as string : undefined;
    const name = req.query.name  ? req.query.name as string : undefined;
    const teamsWithPaging = await grafanaApi.getTeamsWithPaging(perpage, page, query, name);
    res.status(200).json(teamsWithPaging);
});

route.get('/teams/:teamId', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const team = await grafanaApi.getTeamById(teamId);
    res.status(200).json(team);
});

route.put('/teams/:teamId', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const message = await grafanaApi.updateTeamById(teamId, req.body);
    res.status(200).json(message);
});

route.delete('/teams/:teamId', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const message = await grafanaApi.deleteTeamById(teamId);
    res.status(200).json(message);
});

route.get('/teams/:teamId/members', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const members = await grafanaApi.getTeamMembers(teamId);
    res.status(200).json(members);
});

route.post('/teams/:teamId/member', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const msg = await grafanaApi.addMemberToTeam(teamId, req.body);
    res.status(200).json(msg);
});


route.post('/teams/:teamId/members', async (req, res) => {
    const teamId = parseInt(req.params.teamId,10);
    const msg = await grafanaApi.addTeamMembers(teamId, req.body);
    res.status(200).json(msg);
});

route.delete('/teams/:teamId/members/:userId', async (req, res) => {
    const teamId = parseInt(req.params.teamId, 10);
    const userId = parseInt(req.params.userId, 10);
    const msg = await grafanaApi.removeMemberFromTeam(teamId, userId);
    res.status(200).json(msg);
});

route.post('/folders', async (req, res) => {
    const msg = await grafanaApi.createFolder(req.body);
    res.status(200).json(msg);
});

route.post('/folders/:uid/permissions', async (req, res) => {
    const uid = req.params.uid;
    const msg = await grafanaApi.folderPermission(uid, req.body);
    res.status(200).json(msg);
});

export default route;
